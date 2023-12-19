// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

contract Escrow is ERC2771Context {
    using SafeERC20 for IERC20;

    struct Project {
        address owner;
        string name;
        address[] assignedUsers;
        mapping(address => uint256) depositTokens;
        address[] tokenAddresses;
        string[] taskIds;
        uint256 startTimestamp;
        uint256 lastUpdatedTimestamp;
    }

    struct TokenDepositInfo {
        address tokenAddress;
        uint256 depositAmount;
    }

    struct ProjectDetails {
        address owner;
        string name;
        address[] assignedUsers;
        TokenDepositInfo[] tokenDeposits;
        string[] taskIds;
        uint256 startTimestamp;
        uint256 lastUpdatedTimestamp;
    }

    // ユーザーごとのプロジェクトIDリストを格納するマッピング
    mapping(address => string[]) private ownerProjects;

    // プロジェクトIDをキーとするプロジェクトの詳細を格納するマッピング
    mapping(string => Project) private projects;

    // アサインされているユーザーのアドレスに基づいて、関連するプロジェクトIDのリストを格納するマッピング
    mapping(address => string[]) private assignedUserProjects;

    // タスクIDをキーとして、関連するプロジェクトのIDを格納するマッピング
    mapping(string => string) private taskToProject;

    // 存在する全てのプロジェクトID
    string[] private allProjectIds;

    event ProjectCreated(
        string indexed projectId,
        address indexed owner,
        string name,
        uint256 startTimestamp
    );

    event TokenDeposited(
        string indexed projectId,
        address indexed tokenAddress,
        uint256 amount
    );

    event TokensWithdrawn(
        string indexed projectId,
        address indexed owner,
        address indexed tokenAddress,
        uint256 amount
    );

    event UserAssignedToProject(
        string indexed projectId, 
        address indexed user
    );

    event UserUnassignedFromProject(
        string indexed projectId, 
        address indexed user
    );

    event ProjectNameChanged(
        string indexed projectId, 
        string newName
    );

    event ProjectOwnerChanged(
        string indexed projectId, 
        address indexed newOwner
    );

    event ProjectDeleted(
        string indexed projectId, 
        address indexed owner, 
        string projectName
    );

    constructor(ERC2771Forwarder forwarder) 
        ERC2771Context(address(forwarder))
    {}

    modifier updateLastUpdatedTimestamp(string memory projectId) {
        _;
        projects[projectId].lastUpdatedTimestamp = block.timestamp;
    }

    function getOwnerProjects(address owner) external view returns (string[] memory) {
        return ownerProjects[owner];
    }

    function getProjectDetails(string memory projectId) external view returns (ProjectDetails memory) {
        Project storage project = projects[projectId];
        TokenDepositInfo[] memory tokenDeposits = new TokenDepositInfo[](project.tokenAddresses.length);

        for (uint i = 0; i < project.tokenAddresses.length; i++) {
            tokenDeposits[i] = TokenDepositInfo({
                tokenAddress: project.tokenAddresses[i],
                depositAmount: project.depositTokens[project.tokenAddresses[i]]
            });
        }

        return ProjectDetails({
            owner: project.owner,
            name: project.name,
            assignedUsers: project.assignedUsers,
            tokenDeposits: tokenDeposits,
            taskIds: project.taskIds,
            startTimestamp: project.startTimestamp,
            lastUpdatedTimestamp: project.lastUpdatedTimestamp
        });
    }

    function getAssignedUserProjects(address user) external view returns (string[] memory) {
        return assignedUserProjects[user];
    }

    function getProjectIdByTask(string memory taskId) external view returns (string memory) {
        return taskToProject[taskId];
    }

    function getAllProjectIds() public view returns (string[] memory) {
        return allProjectIds;
    }

    function generateProjectId(string memory _name, address _owner) private view returns (string memory) {
        return string(abi.encodePacked(_name, "_", Strings.toHexString(uint256(keccak256(abi.encodePacked(block.timestamp, _owner, block.prevrandao))), 20)));
    }

    function createAndDepositProject(
        string memory _name,
        address[] memory _assignedUsers,
        address[] memory _tokenAddresses,
        uint256[] memory _amounts
    ) external payable {
        require(bytes(_name).length > 0, "Project name cannot be empty");
        require(_assignedUsers.length > 0, "Assigned users cannot be empty");
        require(_tokenAddresses.length == _amounts.length, "Token addresses and amounts must be the same length");

        // ネイティブトークンまたはERC20トークンのいずれかがデポジットされることを確認
        bool isNativeTokenDeposited = msg.value > 0;
        bool isERC20TokenDeposited = false;
        for (uint i = 0; i < _amounts.length; i++) {
            if (_amounts[i] > 0) {
                isERC20TokenDeposited = true;
                break;
            }
        }
        require(isNativeTokenDeposited || isERC20TokenDeposited, "No tokens deposited");

        // プロジェクトIDの生成
        string memory projectId = generateProjectId(_name, _msgSender());

        require(projects[projectId].owner == address(0), "Project already exists");

        // 新しいプロジェクトIDを追加
        allProjectIds.push(projectId);

        // プロジェクトの作成
        Project storage newProject = projects[projectId];
        newProject.owner = _msgSender();
        newProject.name = _name;
        newProject.assignedUsers = _assignedUsers;
        newProject.startTimestamp = block.timestamp;
        newProject.lastUpdatedTimestamp = block.timestamp;

        ownerProjects[_msgSender()].push(projectId);

        // ネイティブトークン（MATIC）のデポジット処理
        if (msg.value > 0) {
            newProject.depositTokens[address(0)] += msg.value; // ネイティブトークンのアドレスは通常 0x0
            newProject.tokenAddresses.push(address(0));
            emit TokenDeposited(projectId, address(0), msg.value);
        }

        // 複数のトークンデポジット処理
        for (uint i = 0; i < _tokenAddresses.length; i++) {
            require(_tokenAddresses[i] != address(0), "Token address cannot be address(0)");
            require(_amounts[i] > 0, "Deposit amount must be greater than 0");
            if (newProject.depositTokens[_tokenAddresses[i]] == 0) {
                newProject.tokenAddresses.push(_tokenAddresses[i]); // 新しいトークンアドレスを追加
            }
            newProject.depositTokens[_tokenAddresses[i]] += _amounts[i]; // トークンごとの合計デポジット額を更新
            IERC20 token = IERC20(_tokenAddresses[i]);
            SafeERC20.safeTransferFrom(token, _msgSender(), address(this), _amounts[i]);

            emit TokenDeposited(projectId, _tokenAddresses[i], _amounts[i]);
        }

        for (uint i = 0; i < _assignedUsers.length; i++) {
            assignedUserProjects[_assignedUsers[i]].push(projectId);
        }

        emit ProjectCreated(projectId, _msgSender(), _name, block.timestamp);
    }

    function depositAdditionalTokensToProject(
        string memory projectId,
        address[] memory tokenAddresses,
        uint256[] memory amounts
    ) external payable updateLastUpdatedTimestamp(projectId) {
        require(tokenAddresses.length == amounts.length, "Token addresses and amounts must be the same length");
        Project storage project = projects[projectId];
        require(_msgSender() == project.owner, "Only the project owner can deposit additional tokens");

        // ネイティブトークン（MATIC）の追加デポジット処理
        if (msg.value > 0) {
            project.depositTokens[address(0)] += msg.value;
            if (project.depositTokens[address(0)] == msg.value) {
                project.tokenAddresses.push(address(0));
            }
            emit TokenDeposited(projectId, address(0), msg.value);
        }

        // ERC20トークンの追加デポジット処理
        for (uint i = 0; i < tokenAddresses.length; i++) {
            require(tokenAddresses[i] != address(0), "Token address cannot be address(0)");
            require(amounts[i] > 0, "Deposit amount must be greater than 0");
            if (project.depositTokens[tokenAddresses[i]] == 0) {
                project.tokenAddresses.push(tokenAddresses[i]);
            }
            project.depositTokens[tokenAddresses[i]] += amounts[i];
            IERC20 token = IERC20(tokenAddresses[i]);
            SafeERC20.safeTransferFrom(token, _msgSender(), address(this), amounts[i]);
            emit TokenDeposited(projectId, tokenAddresses[i], amounts[i]);
        }
    }

    function withdrawTokensFromProject(
        string memory projectId,
        address tokenAddress,
        uint256 amount
    ) external updateLastUpdatedTimestamp(projectId) {
        require(amount > 0, "Withdrawal amount must be greater than 0");
        Project storage project = projects[projectId];
        require(_msgSender() == project.owner, "Only the project owner can withdraw tokens");
        require(project.depositTokens[tokenAddress] >= amount, "Insufficient token balance");

        // トークンの残高を更新
        project.depositTokens[tokenAddress] -= amount;

        // トークンアドレスの削除処理
        if (project.depositTokens[tokenAddress] == 0) {
            removeTokenAddress(project.tokenAddresses, tokenAddress);
        }

        // ERC20トークンの引き出し
        if (tokenAddress != address(0)) { // 通常のERC20トークン
            IERC20 token = IERC20(tokenAddress);
            SafeERC20.safeTransfer(token, _msgSender(), amount);
        } else { // ネイティブトークン（MATIC）の場合
            (bool sent, ) = _msgSender().call{value: amount}("");
            require(sent, "Failed to send native token");
        }

        emit TokensWithdrawn(projectId, _msgSender(), tokenAddress, amount);
    }

    // TODO 追加の人数制限を設けるか？
    function assignUserToProject(
        string memory projectId, 
        address user
    ) external updateLastUpdatedTimestamp(projectId) {
        require(isOwnerOrAssignedUser(projectId, _msgSender()), "Caller is not the owner or an assigned user");
        require(user != address(0), "Invalid user address");

        Project storage project = projects[projectId];

        // TODO 確認：追加するユーザーがオーナーでないことを確認
        require(user != project.owner, "Owner cannot be assigned as a user");

        // ユーザーがすでに割り当てられていないことを確認
        for (uint i = 0; i < project.assignedUsers.length; i++) {
            require(project.assignedUsers[i] != user, "User already assigned");
        }

        // プロジェクトにユーザーを割り当て
        project.assignedUsers.push(user);

        // 割り当てられたユーザーのプロジェクトリストを更新
        assignedUserProjects[user].push(projectId);

        // プロジェクトにユーザーを割り当てたことを記録するイベントを発行
        emit UserAssignedToProject(projectId, user);
    }

    function unassignUserFromProject(
        string memory projectId, 
        address user
    ) external updateLastUpdatedTimestamp(projectId) {
        require(isOwnerOrAssignedUser(projectId, _msgSender()), "Caller is not the owner or an assigned user");
        require(user != address(0), "Invalid user address");

        Project storage project = projects[projectId];
        // TODO 確認：1人になったら削除できない
        require(project.assignedUsers.length > 1, "Cannot remove the last assigned user");

        bool userFound = false;
        for (uint i = 0; i < project.assignedUsers.length; i++) {
            if (project.assignedUsers[i] == user) {
                project.assignedUsers[i] = project.assignedUsers[project.assignedUsers.length - 1];
                project.assignedUsers.pop();
                userFound = true;
                break;
            }
        }
        require(userFound, "User not found");

        // ユーザーが割り当てられたプロジェクトのリストからプロジェクトIDを削除
        removeProjectFromAssignedUser(user, projectId);

        // プロジェクトからユーザーを割り当て解除したことを記録するイベントを発行
        emit UserUnassignedFromProject(projectId, user);
    }

    function changeProjectName(
        string memory projectId, 
        string memory newName
    ) external updateLastUpdatedTimestamp(projectId) {
        require(bytes(newName).length > 0, "New name cannot be empty");
        
        Project storage project = projects[projectId];
        require(_msgSender() == project.owner, "Only the project owner can change the name");

        project.name = newName;

        // プロジェクト名が変更されたことを記録するイベントを発行
        emit ProjectNameChanged(projectId, newName);
    }

    function changeProjectOwner(
        string memory projectId, 
        address newOwner
    ) external updateLastUpdatedTimestamp(projectId) {
        require(newOwner != address(0), "Invalid new owner address");
        Project storage project = projects[projectId];
        require(_msgSender() == project.owner, "Only the current owner can change the project owner");
        for (uint i = 0; i < project.assignedUsers.length; i++) {
            require(project.assignedUsers[i] != newOwner, "New owner cannot be an assigned user");
        }

        // ownerProjects マッピングを更新
        removeProjectFromOwnerProjects(project.owner, projectId);
        ownerProjects[newOwner].push(projectId);

        // オーナーを更新
        project.owner = newOwner;

        // プロジェクトのオーナーが変更されたことを記録するイベントを発行
        emit ProjectOwnerChanged(projectId, newOwner);
    }

    function removeTokenAddress(address[] storage tokenAddresses, address tokenAddress) private {
        uint256 length = tokenAddresses.length;
        for (uint256 i = 0; i < length; i++) {
            if (tokenAddresses[i] == tokenAddress) {
                tokenAddresses[i] = tokenAddresses[length - 1];
                tokenAddresses.pop();
                break;
            }
        }
    }

    function isOwnerOrAssignedUser(string memory projectId, address user) private view returns (bool) {
        Project storage project = projects[projectId];
        if (user == project.owner) {
            return true;
        }
        for (uint i = 0; i < project.assignedUsers.length; i++) {
            if (project.assignedUsers[i] == user) {
                return true;
            }
        }
        return false;
    }

    function removeProjectFromAssignedUser(address user, string memory projectId) private {
        uint256 length = assignedUserProjects[user].length;
        for (uint256 i = 0; i < length; i++) {
            // TODO OZ Stringsを利用できないか？
            if (keccak256(bytes(assignedUserProjects[user][i])) == keccak256(bytes(projectId))) {
                assignedUserProjects[user][i] = assignedUserProjects[user][length - 1];
                assignedUserProjects[user].pop();
                break;
            }
        }
    }

    function removeProjectFromOwnerProjects(address owner, string memory projectId) private {
        uint256 length = ownerProjects[owner].length;
        for (uint256 i = 0; i < length; i++) {
            if (keccak256(bytes(ownerProjects[owner][i])) == keccak256(bytes(projectId))) {
                ownerProjects[owner][i] = ownerProjects[owner][length - 1];
                ownerProjects[owner].pop();
                break;
            }
        }
    }
}
