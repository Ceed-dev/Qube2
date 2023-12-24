// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Escrow is ERC2771Context, Ownable {
    using SafeERC20 for IERC20;

    enum TaskStatus {
        Created, // タスクが作成され、フリーランサーがサインするまで
        Unconfirmed, // フリーランサーがサインをせず、現時点での日時がsubmissionDeadlineを超過している場合（プロジェクトオーナーは必要に応じてタスクを期限の変更またはタスクの削除をする選択肢があります。）
        InProgress, // フリーランサーが作業を進行中
        DeletionRequested, // フリーランサーによってサインされた後にクリエイターがカードの削除依頼をした場合
        SubmissionOverdue, // 提出期限超過
        UnderReview, // 提出された成果物がレビュー中
        ReviewOverdue, // レビュー期限超過
        PendingPayment, // 支払い待ち
        PaymentOverdue, // 支払い期限超過
        DeadlineExtensionRequested, // 期限延長が要求された
        LockedByDisapproval // 不承認によりトークンがロックされた状態
    }

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

    struct Task {
        string projectId; // タスクが属するプロジェクトのID
        address creator; // タスクを作成したアドレス
        address recipient; // 報酬の受取人アドレス
        address tokenAddress; // ロックされるトークンのアドレス
        uint256 lockedAmount; // ロックされるトークンの量
        uint256 submissionDeadline; // 提出期限
        uint256 reviewDeadline; // レビュー期限
        uint256 paymentDeadline; // 支払期限
        uint256 deletionRequestTimestamp; // ステータスがInProgress（recipientのサイン後かつ成果物の提出前）のとき、タスク削除申請が作成されたタイムスタンプ（デフォルトでは0のため、0の場合は使用されてない）
        uint256 deadlineExtensionTimestamp; // 期限延長申請が作成されたタイムスタンプ（デフォルトでは0のため、0の場合は使用されてない）
        TaskStatus status; // タスクのステータス
        uint256 startTimestamp;
        uint256 lastUpdatedTimestamp;
        uint256 lockReleaseTimestamp; // トークン解放のタイムスタンプ
    }

    uint256 public minSubmissionDeadlineDays;
    uint256 public minReviewDeadlineDays;
    uint256 public minPaymentDeadlineDays;
    uint256 public lockPeriodDays;
    uint256 public deadlineExtensionPeriodDays;

    // ユーザーごとのプロジェクトIDリストを格納するマッピング
    mapping(address => string[]) private ownerProjects;

    // プロジェクトIDをキーとするプロジェクトの詳細を格納するマッピング
    mapping(string => Project) private projects;

    // タスクIDをキーとするタスクの詳細を格納するマッピング
    mapping(string => Task) private tasks;

    // アサインされているユーザーのアドレスに基づいて、関連するプロジェクトIDのリストを格納するマッピング
    mapping(address => string[]) private assignedUserProjects;

    // 存在する全てのプロジェクトID
    string[] private allProjectIds;

    // 存在する全てのタスクID
    string[] private allTaskIds;

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

    event TaskStatusUpdated(
        string indexed taskId, 
        TaskStatus newStatus
    );

    // タスク作成：firebaseへ保存 -> オンチェーンへ保存の順で行う。firebaseで作成されたユニークIDをタスクIDとして使う。
    event TaskCreated(
        string indexed taskId,
        string indexed projectId,
        address indexed creator,
        address tokenAddress,
        uint256 lockedAmount,
        uint256 submissionDeadline,
        uint256 reviewDeadline,
        uint256 paymentDeadline
    );

    // 設定変更のイベント
    event MinSubmissionDeadlineDaysUpdated(uint256 newDays);
    event MinReviewDeadlineDaysUpdated(uint256 newDays);
    event MinPaymentDeadlineDaysUpdated(uint256 newDays);

    // イベントの定義
    event TaskStatusUpdated(
        string indexed taskId, 
        TaskStatus newStatus
    );

    // ロック期間変更のイベント
    event LockPeriodDaysUpdated(uint256 newDays);

    event TaskDeleted(string indexed taskId);

    // トークン移動とタスク削除の完了を示すイベント
    event TaskProcessed(
        string indexed taskId,
        TaskStatus status,
        address indexed sender,
        address recipient,
        bool tokensReleased
    );

    event TokensReturnedToProject(
        string indexed taskId, 
        address indexed tokenAddress, 
        uint256 amount
    );

    event TokensLockedForDisapproval(
        string indexed taskId, 
        address indexed tokenAddress, 
        uint256 amount, 
        uint256 lockReleaseTimestamp
    );

    event TokensReleasedToRecipient(
        string indexed taskId, 
        address indexed tokenAddress, 
        uint256 amount
    );

    event DeletionRequestRejected(
        string indexed taskId, 
        address indexed recipient
    );

    event RecipientAssignedToTask(
        string indexed taskId,
        address indexed recipient
    );

    event TaskSubmitted(string indexed taskId);

    event TaskApproved(
        string indexed taskId, 
        address indexed approver
    );

    event DeadlineExtensionRequested(
        string indexed taskId, 
        address indexed requestor
    );

    event TaskDeadlinesUpdated(
        string indexed taskId,
        uint256 newSubmissionDeadline,
        uint256 newReviewDeadline,
        uint256 newPaymentDeadline
    );

    event TaskStatusChangedToCreatedFromUnconfirmed(
        string indexed taskId,
        bool changed
    );

    event SubmissionDisapproved(
        string indexed taskId, 
        address disapprover
    );

    event DeadlineExtensionApproved(string indexed taskId);

    event DeadlineExtensionRejected(string indexed taskId);

    event TaskDeletionRequested(
        string indexed taskId, 
        address requester
    );

    constructor(
        ERC2771Forwarder forwarder, 
        uint256 _minSubmissionDeadlineDays, 
        uint256 _minReviewDeadlineDays, 
        uint256 _minPaymentDeadlineDays, 
        uint256 _lockPeriodDays, 
        uint256 _deadlineExtensionPeriodDays
    ) 
        ERC2771Context(address(forwarder))
        Ownable(msg.sender)
    {
        minSubmissionDeadlineDays = _minSubmissionDeadlineDays;
        minReviewDeadlineDays = _minReviewDeadlineDays;
        minPaymentDeadlineDays = _minPaymentDeadlineDays;
        lockPeriodDays = _lockPeriodDays;
        deadlineExtensionPeriodDays = _deadlineExtensionPeriodDays;
    }

    modifier updateProjectLastUpdatedTimestamp(string memory projectId) {
        _;
        projects[projectId].lastUpdatedTimestamp = block.timestamp;
    }

    modifier updateTaskLastUpdatedTimestamp(string memory taskId) {
        _;
        tasks[taskId].lastUpdatedTimestamp = block.timestamp;
    }

    // ステータス更新modifier
    modifier updateStatus(string memory taskId) {
        updateTaskStatus(taskId);
        _;
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

    function getAllProjectIds() public view returns (string[] memory) {
        return allProjectIds;
    }

    function getTaskDetails(string memory taskId) external view returns (Task memory) {
        require(bytes(taskId).length > 0, "Task ID cannot be empty");
        Task storage task = tasks[taskId];
        require(task.tokenAddress != address(0), "Task does not exist");

        return Task({
            projectId: task.projectId,
            creator: task.creator,
            recipient: task.recipient,
            tokenAddress: task.tokenAddress,
            lockedAmount: task.lockedAmount,
            submissionDeadline: task.submissionDeadline,
            reviewDeadline: task.reviewDeadline,
            paymentDeadline: task.paymentDeadline,
            deletionRequestTimestamp: task.deletionRequestTimestamp, 
            deadlineExtensionTimestamp: task.deadlineExtensionTimestamp,
            status: task.status,
            startTimestamp: task.startTimestamp,
            lastUpdatedTimestamp: task.lastUpdatedTimestamp,
            lockReleaseTimestamp: task.lockReleaseTimestamp
        });
    }

    function getAllTaskIds() public view returns (string[] memory) {
        return allTaskIds;
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
    ) external payable updateProjectLastUpdatedTimestamp(projectId) {
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
    ) external updateProjectLastUpdatedTimestamp(projectId) {
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

    function assignUserToProject(
        string memory projectId, 
        address user
    ) external updateProjectLastUpdatedTimestamp(projectId) {
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
    ) external updateProjectLastUpdatedTimestamp(projectId) {
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
    ) external updateProjectLastUpdatedTimestamp(projectId) {
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
    ) external updateProjectLastUpdatedTimestamp(projectId) {
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

    function deleteProject(string memory projectId) external {
        Project storage project = projects[projectId];
        require(_msgSender() == project.owner, "Only the project owner can delete the project");
        require(project.taskIds.length == 0, "Project cannot be deleted with remaining tasks");

        // プロジェクト名を一時変数に保存
        string memory projectName = project.name;

        // デポジットの返却
        for (uint i = 0; i < project.tokenAddresses.length; i++) {
            address tokenAddress = project.tokenAddresses[i];
            uint256 depositAmount = project.depositTokens[tokenAddress];

            // マッピングの値を先にリセット
            project.depositTokens[tokenAddress] = 0;

            if (depositAmount > 0) {
                if (tokenAddress != address(0)) { // 通常のERC20トークン
                    IERC20 token = IERC20(tokenAddress);
                    SafeERC20.safeTransfer(token, _msgSender(), depositAmount);
                } else { // ネイティブトークン（MATIC）の場合
                    (bool sent, ) = _msgSender().call{value: depositAmount}("");
                    require(sent, "Failed to send native token");
                }
            }
        }

        // プロジェクト関連データのクリーンアップ
        // すべてのプロジェクトIDのリストからプロジェクトIDを削除
        removeProjectId(projectId);

        // プロジェクトの割り当てられたユーザーからプロジェクトIDを削除
        removeProjectFromAssignedUsers(projectId, project);

        // ownerProjects からプロジェクトIDを削除
        removeProjectFromOwnerProjects(_msgSender(), projectId);

        // プロジェクトの削除
        delete projects[projectId];

        emit ProjectDeleted(projectId, _msgSender(), projectName);
    }

    function createTask(
        string memory taskId,
        string memory projectId,
        address tokenAddress,
        uint256 lockedAmount,
        uint256 submissionDeadline,
        uint256 reviewDeadline,
        uint256 paymentDeadline
    ) external updateProjectLastUpdatedTimestamp(projectId) {
        // タスクが既に存在しないことを確認
        require(tasks[taskId].creator == address(0), "Task already exists");

        // msg.senderがプロジェクトにアサインされていることを確認
        require(isUserAssignedToProject(projectId, _msgSender()), "Sender is not assigned to the project");

        // tokenAddressとlockedAmountが適切であることを確認
        Project storage project = projects[projectId];
        require(lockedAmount > 0, "Locked amount must be greater than zero");
        require(project.depositTokens[tokenAddress] >= lockedAmount, "Insufficient funds in project");

        // 期限の検証
        validateTaskDeadlines(submissionDeadline, reviewDeadline, paymentDeadline);

        // タスクの作成
        Task storage task = tasks[taskId];
        task.projectId = projectId;
        task.creator = _msgSender();
        task.tokenAddress = tokenAddress; // 仮定: プロジェクトには1種類のトークンのみ
        task.lockedAmount = lockedAmount;
        task.submissionDeadline = submissionDeadline;
        task.reviewDeadline = reviewDeadline;
        task.paymentDeadline = paymentDeadline;
        task.status = TaskStatus.Created;
        task.startTimestamp = block.timestamp;
        task.lastUpdatedTimestamp = block.timestamp;

        // 新しいタスクIDを追加
        allTaskIds.push(taskId);

        // プロジェクトにタスクIDを追加
        projects[projectId].taskIds.push(taskId);

        // プロジェクトの報酬ロック
        project.depositTokens[tokenAddress] -= lockedAmount;

        // トークンアドレスの削除処理
        if (project.depositTokens[tokenAddress] == 0) {
            removeTokenAddress(project.tokenAddresses, tokenAddress);
        }

        // イベント発行
        emit TaskCreated(
            taskId,
            projectId,
            _msgSender(),
            tokenAddress,
            lockedAmount,
            submissionDeadline,
            reviewDeadline,
            paymentDeadline
        );
    }

    // タスクを削除する外部関数
    function transferTokensAndDeleteTask(string memory taskId) 
        external 
        updateStatus(taskId) 
        updateProjectLastUpdatedTimestamp(tasks[taskId].projectId) 
    {
        Task storage task = tasks[taskId];
        require(task.creator != address(0), "Task does not exist");

        bool shouldReleaseTokensToRecipient = false;

        // ステータスとユーザーの権限を確認
        if (task.status == TaskStatus.Created || task.status == TaskStatus.Unconfirmed || task.status == TaskStatus.SubmissionOverdue) {
            // タスクが作成された状態、または提出期限が過ぎて未確認の状態、あるいは提出期限超過の場合、
            // プロジェクトにアサインされているユーザーのみがタスクを削除できる
            require(isUserAssignedToProject(task.projectId, _msgSender()), "User is not assigned to the project");
        } else if (task.status == TaskStatus.DeletionRequested) {
            // タスクの削除がリクエストされた状態の場合、受取人のみがタスクを削除できる
            require(task.recipient == _msgSender(), "Only the recipient can delete the task in this status");
        } else if (task.status == TaskStatus.LockedByDisapproval) {
            // タスクが不承認によりロックされている場合、ロック解除タイムスタンプを過ぎている必要があり、
            // プロジェクトにアサインされているユーザーのみがタスクを削除できる
            require(block.timestamp > task.lockReleaseTimestamp, "Lock period has not ended");
            require(isUserAssignedToProject(task.projectId, _msgSender()), "User is not assigned to the project");
        } else if (task.status == TaskStatus.ReviewOverdue || task.status == TaskStatus.PaymentOverdue) {
            require(task.recipient == _msgSender(), "Only the recipient can perform this action");
            shouldReleaseTokensToRecipient = true;
        } else if (task.status == TaskStatus.PendingPayment) {
            require(project.owner == _msgSender(), "Only the project owner can perform this action");
            shouldReleaseTokensToRecipient = true;
        } else {
            // 上記のいずれの状態にも当てはまらない場合、タスクは削除できない
            revert("Transfer of tokens and deletion of task cannot be performed in the current status");
        }

        // トークンを受取人に引き渡すか、プロジェクトに戻す
        if (shouldReleaseTokensToRecipient) {
            releaseTokensToRecipient(taskId);
        } else {
            returnTokensToProject(taskId);
        }

        // イベント発行
        emit TaskProcessed(
            taskId,
            task.status,
            _msgSender(),
            task.recipient,
            shouldReleaseTokensToRecipient
        );

        // タスクを削除
        deleteTask(taskId);
    }

    // タスクの削除依頼を拒否する関数
    function rejectDeletionRequest(string memory taskId) 
        external
        updateStatus(taskId)
        updateTaskLastUpdatedTimestamp(taskId)
    {
        Task storage task = tasks[taskId];

        // タスクが存在することを確認
        require(task.creator != address(0), "Task does not exist");

        // 呼び出し元がタスクの受取人であることを確認
        require(task.recipient == _msgSender(), "Only the recipient can reject the deletion request");

        // ステータスがDeletionRequestedであることを確認
        require(task.status == TaskStatus.DeletionRequested, "Task is not in DeletionRequested status");

        // ステータスをInProgressに戻す
        task.status = TaskStatus.InProgress;

        // イベント発行
        emit DeletionRequestRejected(taskId, _msgSender());
    }

    function assignRecipientToTask(string memory taskId) 
        external 
        updateStatus(taskId)
        updateTaskLastUpdatedTimestamp(taskId)
    {
        // タスクが存在することを確認
        Task storage task = tasks[taskId];
        require(task.creator != address(0), "Task does not exist");

        // ステータスがCreatedであることを確認
        require(task.status == TaskStatus.Created, "Task is not in Created status");

        // 呼び出し元がプロジェクトのオーナーやアサインされたユーザー以外であることを確認
        require(!isOwnerOrAssignedUser(task.projectId, _msgSender()), "Owner or assigned user cannot be recipient");

        // recipientアドレスを登録
        task.recipient = _msgSender();

        // ステータスをInProgressに変更
        task.status = TaskStatus.InProgress;

        // イベント発行
        emit RecipientAssignedToTask(taskId, _msgSender());
    }

    function submitTask(string memory taskId) 
        external 
        updateStatus(taskId)
        updateTaskLastUpdatedTimestamp(taskId)
    {
        // タスクが存在することを確認
        Task storage task = tasks[taskId];
        require(task.creator != address(0), "Task does not exist");

        // 呼び出し元がタスクの受取人であることを確認
        require(_msgSender() == task.recipient, "Only the recipient can submit the task");

        // ステータスがInProgressであることを確認
        require(task.status == TaskStatus.InProgress, "Task is not in progress");

        // ステータスをUnderReviewに変更
        task.status = TaskStatus.UnderReview;

        // イベント発行
        emit TaskSubmitted(taskId);
    }

    function approveTask(string memory taskId) 
        external
        updateStatus(taskId)
        updateTaskLastUpdatedTimestamp(taskId)
    {
        // タスクが存在することを確認
        Task storage task = tasks[taskId];
        require(task.creator != address(0), "Task does not exist");

        // 呼び出し元がタスクのプロジェクトにアサインされているユーザーであることを確認
        require(isUserAssignedToProject(task.projectId, _msgSender()), "User is not assigned to the project");

        // ステータスがUnderReviewであることを確認
        require(task.status == TaskStatus.UnderReview, "Task is not under review");

        // ステータスをPendingPaymentに変更
        task.status = TaskStatus.PendingPayment;

        // イベント発行
        emit TaskApproved(taskId, _msgSender());
    }

    function requestDeadlineExtension(string memory taskId) 
        external
        updateStatus(taskId)
        updateTaskLastUpdatedTimestamp(taskId)
    {
        // タスクが存在することを確認
        Task storage task = tasks[taskId];
        require(task.creator != address(0), "Task does not exist");

        // 呼び出し元がタスクのプロジェクトにアサインされているユーザーであることを確認
        require(isUserAssignedToProject(task.projectId, _msgSender()), "User is not assigned to the project");

        // ステータスがUnderReviewであることを確認
        require(task.status == TaskStatus.UnderReview, "Task is not under review");

        // 期限延長申請がまだ行われていないことを確認
        require(task.deadlineExtensionTimestamp == 0, "Deadline extension has already been requested");

        // ステータスをDeadlineExtensionRequestedに変更
        task.status = TaskStatus.DeadlineExtensionRequested;

        // 現在のタイムスタンプをdeadlineExtensionTimestampに設定
        task.deadlineExtensionTimestamp = block.timestamp;

        // イベント発行
        emit DeadlineExtensionRequested(taskId, _msgSender());
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

    function removeProjectId(string memory projectId) private {
        uint256 length = allProjectIds.length;
        for (uint256 i = 0; i < length; i++) {
            if (keccak256(bytes(allProjectIds[i])) == keccak256(bytes(projectId))) {
                allProjectIds[i] = allProjectIds[length - 1];
                allProjectIds.pop();
                break;
            }
        }
    }

    function removeProjectFromAssignedUsers(string memory projectId, Project storage project) private {
        for (uint i = 0; i < project.assignedUsers.length; i++) {
            address user = project.assignedUsers[i];
            removeProjectFromUserProjects(user, projectId);
        }
    }

    function removeProjectFromUserProjects(address user, string memory projectId) private {
        uint256 length = assignedUserProjects[user].length;
        for (uint256 i = 0; i < length; i++) {
            if (keccak256(bytes(assignedUserProjects[user][i])) == keccak256(bytes(projectId))) {
                assignedUserProjects[user][i] = assignedUserProjects[user][length - 1];
                assignedUserProjects[user].pop();
                break;
            }
        }
    }

    function generateProjectId(string memory _name, address _owner) private view returns (string memory) {
        return string(abi.encodePacked(_name, "_", Strings.toHexString(uint256(keccak256(abi.encodePacked(block.timestamp, _owner, block.prevrandao))), 20)));
    }
}
