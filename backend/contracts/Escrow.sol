// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Escrow is ERC2771Context, Ownable {
    using SafeERC20 for IERC20;

    struct Deposit {
        mapping(address => uint256) tokenBalances;
        address[] tokenList;
    }

    mapping(address => Deposit) private deposits;
    address[] private depositors;

    struct Project {
        address depositor;
        address recipient;
        address tokenAddress;
        uint256 amount;
        uint256 timestamp;
    }

    mapping(string => Project) private projects;
    string[] private projectIds;

    event NativeTokenDeposited(address indexed depositor, uint256 amount);
    event ERC20TokenDeposited(address indexed depositor, address tokenAddress, uint256 amount);
    event DepositWithdrawn(address indexed depositor, address tokenAddress, uint256 amount);
    event OwnerAction(string indexed action, string indexed depositId);

    // modifier validateDeposit(address _recipient, string memory _depositId) {
    //     require(_msgSender() != address(0), "createDeposit: Invalid depositor address");
    //     require(_recipient != address(0), "createDeposit: Invalid recipient address");
    //     require(deposits[_depositId].depositor == address(0), "createDeposit: Deposit ID already exists");
    //     require(bytes(_depositId).length != 0, "createDeposit: DepositId should not be empty");
    //     _;
    // }

    constructor(ERC2771Forwarder forwarder) 
        ERC2771Context(address(forwarder))
        Ownable(msg.sender)
    {}

    function depositNativeToken() external payable {
        require(msg.value > 0, "depositNativeToken: Amount must be greater than 0");

        Deposit storage userDeposit = deposits[_msgSender()];
        userDeposit.tokenBalances[address(0)] += msg.value;
        if (userDeposit.tokenBalances[address(0)] == msg.value) {
            userDeposit.tokenList.push(address(0));
            addDepositor(_msgSender());
        }

        // deposits[_depositId] = Deposit({
        //     depositor: _msgSender(),
        //     recipient: _recipient,
        //     tokenAddress: address(0),
        //     amount: msg.value
        // });
        // depositIds.push(_depositId);
        
        emit NativeTokenDeposited(_msgSender(), msg.value);
    }

    function depositERC20Token(address _tokenAddress, uint256 _amount) external {
        require(_amount > 0, "depositERC20Token: Amount must be greater than 0");
        require(_tokenAddress != address(0), "depositERC20Token: Invalid token address");

        IERC20 token = IERC20(_tokenAddress);
        SafeERC20.safeTransferFrom(token, _msgSender(), address(this), _amount);

        Deposit storage userDeposit = deposits[_msgSender()];
        userDeposit.tokenBalances[_tokenAddress] += _amount;
        if (userDeposit.tokenBalances[_tokenAddress] == _amount) {
            userDeposit.tokenList.push(_tokenAddress);
            addDepositor(_msgSender());
        }

        // deposits[_depositId] = Deposit({
        //     depositor: _msgSender(),
        //     recipient: _recipient,
        //     tokenAddress: _tokenAddress,
        //     amount: _amount
        // });
        // depositIds.push(_depositId);

        emit ERC20TokenDeposited(_msgSender(), _tokenAddress, _amount);
    }

    function getTokenBalance(address _user, address _tokenAddress) public view returns (uint256) {
        return deposits[_user].tokenBalances[_tokenAddress];
    }

    function getUserTokenList(address _user) public view returns (address[] memory) {
        return deposits[_user].tokenList;
    }

    function getDepositors() public view returns (address[] memory) {
        return depositors;
    }

    function withdraw(address _tokenAddress, uint256 _amount) public {
        require(_amount > 0, "withdraw: Amount must be greater than 0");
        Deposit storage userDeposit = deposits[_msgSender()];
        require(userDeposit.tokenBalances[_tokenAddress] >= _amount, "Insufficient balance");
        userDeposit.tokenBalances[_tokenAddress] -= _amount;
        if (userDeposit.tokenBalances[_tokenAddress] == 0) {
            removeTokenFromList(_msgSender(), _tokenAddress);
        }

        if (isUserDepositEmpty(_msgSender())) {
            removeDepositor(_msgSender());
        }

        if (_tokenAddress == address(0)) {
            (bool sent, ) = _msgSender().call{value: _amount}("");
            require(sent, "Failed to send native token");
        } else {
            // Transfer the tokens using SafeERC20
            IERC20 token = IERC20(_tokenAddress);
            SafeERC20.safeTransfer(token, _msgSender(), _amount);
        }

        emit DepositWithdrawn(_msgSender(), _tokenAddress, _amount);
    }

    function removeTokenFromList(address _user, address _tokenAddress) private {
        Deposit storage userDeposit = deposits[_user];
        uint256 length = userDeposit.tokenList.length;
        for (uint256 i = 0; i < length; i++) {
            if (userDeposit.tokenList[i] == _tokenAddress) {
                userDeposit.tokenList[i] = userDeposit.tokenList[length - 1];
                userDeposit.tokenList.pop();
                break;
            }
        }
    }

    function addDepositor(address _user) private {
        for (uint256 i = 0; i < depositors.length; i++) {
            if (depositors[i] == _user) {
                return;
            }
        }
        depositors.push(_user);
    }

    function removeDepositor(address _user) private {
        for (uint256 i = 0; i < depositors.length; i++) {
            if (depositors[i] == _user) {
                depositors[i] = depositors[depositors.length - 1];
                depositors.pop();
                break;
            }
        }
    }

    function isUserDepositEmpty(address _user) private view returns (bool) {
        Deposit storage userDeposit = deposits[_user];
        for (uint256 i = 0; i < userDeposit.tokenList.length; i++) {
            if (userDeposit.tokenBalances[userDeposit.tokenList[i]] > 0) {
                return false;
            }
        }
        return true;
    }


    // function withdrawToRecipientByDepositor(string memory _depositId) external {
    //     require(deposits[_depositId].depositor == _msgSender(), "Not authorized to withdraw this deposit");
    //     _executeWithdraw(_depositId, deposits[_depositId].recipient);
    // }

    // function withdrawToRecipientByOwner(string memory _depositId) external onlyOwner {
    //     emit OwnerAction("withdrawToRecipient", _depositId);
    //     _executeWithdraw(_depositId, deposits[_depositId].recipient);
    // }

    // function withdrawToDepositorByOwner(string memory _depositId) external onlyOwner {
    //     emit OwnerAction("withdrawToDepositor", _depositId);
    //     _executeWithdraw(_depositId, deposits[_depositId].depositor);
    // }

    // function getDeposit(string memory _depositId) public view onlyOwner returns (Deposit memory) {
    //     return deposits[_depositId];
    // }

    // function getDepositIds() public view onlyOwner returns (string[] memory) {
    //     return depositIds;
    // }

    // function _executeWithdraw(string memory _depositId, address _recipient) internal {
    //     Deposit storage deposit = deposits[_depositId];
    //     require(deposit.depositor != address(0), "Deposit does not exist");

    //     uint256 amount = deposit.amount;
    //     address tokenAddress = deposit.tokenAddress;

    //     // Delete the deposit data
    //     delete deposits[_depositId];
    //     _removeDepositId(_depositId);

    //     if (tokenAddress == address(0)) {
    //         (bool sent, ) = _recipient.call{value: amount}("");
    //         require(sent, "Failed to send native token");
    //     } else {
    //         // Transfer the tokens using SafeERC20
    //         IERC20 token = IERC20(tokenAddress);
    //         SafeERC20.safeTransfer(token, _recipient, amount);
    //     }

    //     emit DepositWithdrawn(_depositId, _recipient);
    // }

    // function _removeDepositId(string memory _depositId) internal {
    //     uint256 index = _findDepositIdIndex(_depositId);
    //     require(index != type(uint256).max, "Deposit ID not found");

    //     // Get last element
    //     string memory lastElement = depositIds[depositIds.length - 1];
    //     // Set the last element to the position of the element you want to remove
    //     depositIds[index] = lastElement;
    //     // Decrease the size of the array by one
    //     depositIds.pop();
    // }

    // function _findDepositIdIndex(string memory _depositId) internal view returns (uint256) {
    //     for (uint256 i = 0; i < depositIds.length; i++) {
    //         if (keccak256(bytes(depositIds[i])) == keccak256(bytes(_depositId))) {
    //             return i;
    //         }
    //     }
    //     return type(uint256).max;
    // }

    function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
        return ERC2771Context._msgSender();
    }

    function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
        return ERC2771Context._msgData();
    }
}
