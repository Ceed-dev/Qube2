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
}
