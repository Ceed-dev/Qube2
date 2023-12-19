// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";

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

    constructor(ERC2771Forwarder forwarder) 
        ERC2771Context(address(forwarder))
    {}
}
