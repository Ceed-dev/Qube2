// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/metatx/ERC2771Context.sol";
import "@openzeppelin/contracts/metatx/ERC2771Forwarder.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
// import "@openzeppelin/contracts/access/Ownable.sol";

contract Escrow is ERC2771Context {
  using SafeERC20 for IERC20;

  enum TaskStatus {
    Created,
    Unconfirmed,
    InProgress,
    DeletionRequested,
    SubmissionOverdue,
    UnderReview,
    ReviewOverdue,
    PendingPayment,
    PaymentOverdue,
    DeadlineExtensionRequested,
    LockedByDisapproval
  }

  struct Project {
    address owner;
    string name;
    address[] assignedUsers;
    mapping(address => uint256) depositTokens;
    address[] tokenAddresses;
    string[] taskIds;
    uint256 startTimestamp;
    // uint256 lastUpdatedTimestamp;
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
    // uint256 lastUpdatedTimestamp;
  }

  struct Task {
    string projectId;
    address creator;
    address recipient;
    address tokenAddress;
    uint256 lockedAmount;
    uint256 submissionDeadline;
    uint256 reviewDeadline;
    uint256 paymentDeadline;
    uint256 deletionRequestTimestamp;
    uint256 deadlineExtensionTimestamp;
    TaskStatus status;
    uint256 startTimestamp;
    // uint256 lastUpdatedTimestamp;
    uint256 lockReleaseTimestamp;
  }

  uint256 public minSubmissionDeadlineDays;
  uint256 public minReviewDeadlineDays;
  uint256 public minPaymentDeadlineDays;
  uint256 public lockPeriodDays;
  uint256 public deadlineExtensionPeriodDays;

  mapping(address => string[]) private ownerProjects;
  mapping(address => string[]) private assignedUserProjects;
  mapping(string => Project) private projects;
  mapping(string => Task) private tasks;
  string[] private allProjectIds;
  // string[] private allTaskIds;

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

  event TaskStatusUpdated(
    string indexed taskId, 
    TaskStatus newStatus
  );

  // event TaskDeadlinesUpdated(
  //   string indexed taskId,
  //   uint256 newSubmissionDeadline,
  //   uint256 newReviewDeadline,
  //   uint256 newPaymentDeadline
  // );

  // event TokenTransfer(
  //   string indexed taskId,
  //   address indexed recipient,
  //   address indexed tokenAddress,
  //   uint256 amount
  // );

  event TaskProcessed(
    string indexed taskId,
    TaskStatus status,
    address indexed sender,
    address recipient,
    bool tokensReleased
  );

  // event TaskDeleted(string indexed taskId);

  // event RecipientAssignedToTask(
  //   string indexed taskId,
  //   address indexed recipient
  // );

  // event TaskSubmitted(string indexed taskId);

  // event TaskApproved(
  //   string indexed taskId, 
  //   address indexed approver
  // );

  // event TokensWithdrawn(
  //   string indexed projectId,
  //   address indexed owner,
  //   address indexed tokenAddress,
  //   uint256 amount
  // );

  // event UserAssignedToProject(
  //   string indexed projectId, 
  //   address indexed user
  // );

  // event UserUnassignedFromProject(
  //   string indexed projectId, 
  //   address indexed user
  // );

  // event ProjectNameChanged(
  //   string indexed projectId, 
  //   string newName
  // );

  // event ProjectOwnerChanged(
  //   string indexed projectId, 
  //   address indexed newOwner
  // );

  // event ProjectDeleted(
  //   string indexed projectId, 
  //   address indexed owner, 
  //   string projectName
  // );

  // event DeletionRequestRejected(
  //   string indexed taskId, 
  //   address indexed recipient
  // );

  // event DeadlineExtensionRequested(
  //   string indexed taskId, 
  //   address indexed requestor
  // );

  // event TaskStatusChangedToCreatedFromUnconfirmed(
  //   string indexed taskId,
  //   bool changed
  // );

  // event DeadlineExtensionApproved(string indexed taskId);

  // event SubmissionDisapproved(
  //   string indexed taskId, 
  //   address indexed disapprover,
  //   address indexed tokenAddress, 
  //   uint256 amount, 
  //   uint256 lockReleaseTimestamp
  // );

  // event DeadlineExtensionRejected(string indexed taskId);

  // event TaskDeletionRequested(
  //   string indexed taskId, 
  //   address requester
  // );

  // event MinSubmissionDeadlineDaysUpdated(uint256 newDays);

  // event MinReviewDeadlineDaysUpdated(uint256 newDays);

  // event MinPaymentDeadlineDaysUpdated(uint256 newDays);

  // event LockPeriodDaysUpdated(uint256 newDays);

  constructor(
    ERC2771Forwarder forwarder,
    uint256 _minSubmissionDeadlineDays, 
    uint256 _minReviewDeadlineDays, 
    uint256 _minPaymentDeadlineDays, 
    uint256 _lockPeriodDays, 
    uint256 _deadlineExtensionPeriodDays
  ) 
    ERC2771Context(address(forwarder))
    // Ownable(msg.sender)
  {
    minSubmissionDeadlineDays = _minSubmissionDeadlineDays;
    minReviewDeadlineDays = _minReviewDeadlineDays;
    minPaymentDeadlineDays = _minPaymentDeadlineDays;
    lockPeriodDays = _lockPeriodDays;
    deadlineExtensionPeriodDays = _deadlineExtensionPeriodDays;
  }

  // modifier updateProjectLastUpdatedTimestamp(string memory projectId) {
  //   _;
  //   projects[projectId].lastUpdatedTimestamp = block.timestamp;
  // }

  // modifier updateTaskLastUpdatedTimestamp(string memory taskId) {
  //   _;
  //   tasks[taskId].lastUpdatedTimestamp = block.timestamp;
  // }

  modifier updateStatus(string memory taskId) {
    updateTaskStatus(taskId);
    _;
  }

  function getOwnerProjects(address owner) external view returns (string[] memory) {
    return ownerProjects[owner];
  }

  function getAssignedUserProjects(address user) external view returns (string[] memory) {
    return assignedUserProjects[user];
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
      startTimestamp: project.startTimestamp
      // lastUpdatedTimestamp: project.lastUpdatedTimestamp
    });
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
      // lastUpdatedTimestamp: task.lastUpdatedTimestamp,
      lockReleaseTimestamp: task.lockReleaseTimestamp
    });
  }

  function getAllProjectIds() public view returns (string[] memory) {
    return allProjectIds;
  }

  // function getAllTaskIds() public view returns (string[] memory) {
  //   return allTaskIds;
  // }

  function createAndDepositProject(
    string memory name,
    address[] memory assignedUsers,
    address[] memory tokenAddresses,
    uint256[] memory amounts
  ) external payable returns (string memory) {
    require(bytes(name).length > 0, "Project name cannot be empty");
    require(assignedUsers.length > 0, "Assigned users cannot be empty");
    require(tokenAddresses.length == amounts.length, "Token addresses and amounts must be the same length");

    bool isNativeTokenDeposited = msg.value > 0;
    bool isERC20TokenDeposited = false;
    for (uint i = 0; i < amounts.length; i++) {
      if (amounts[i] > 0) {
        isERC20TokenDeposited = true;
        break;
      }
    }
    require(isNativeTokenDeposited || isERC20TokenDeposited, "No tokens deposited");

    string memory projectId = generateProjectId(name, _msgSender());

    require(projects[projectId].owner == address(0), "Project already exists");

    allProjectIds.push(projectId);

    Project storage newProject = projects[projectId];
    newProject.owner = _msgSender();
    newProject.name = name;
    newProject.assignedUsers = assignedUsers;
    newProject.startTimestamp = block.timestamp;
    // newProject.lastUpdatedTimestamp = block.timestamp;

    ownerProjects[_msgSender()].push(projectId);

    if (msg.value > 0) {
      depositToken(projectId, address(0), msg.value);
    }

    for (uint i = 0; i < tokenAddresses.length; i++) {
      depositToken(projectId, tokenAddresses[i], amounts[i]);
    }

    for (uint i = 0; i < assignedUsers.length; i++) {
      assignedUserProjects[assignedUsers[i]].push(projectId);
    }

    emit ProjectCreated(projectId, _msgSender(), name, block.timestamp);

    return projectId;
  }

  function depositAdditionalTokensToProject(
    string memory projectId,
    address[] memory tokenAddresses,
    uint256[] memory amounts
  ) 
    external 
    payable 
    // updateProjectLastUpdatedTimestamp(projectId) 
  {
    require(tokenAddresses.length == amounts.length, "Token addresses and amounts must be the same length");
    require(_msgSender() == projects[projectId].owner, "Only owner can deposit");

    if (msg.value > 0) {
      depositToken(projectId, address(0), msg.value);
    }

    for (uint i = 0; i < tokenAddresses.length; i++) {
      depositToken(projectId, tokenAddresses[i], amounts[i]);
    }
  }

  function withdrawTokensFromProject(
    string memory projectId,
    address tokenAddress,
    uint256 amount
  ) 
    external 
    // updateProjectLastUpdatedTimestamp(projectId) 
  {
    require(amount > 0, "Amount must be > 0");
    Project storage project = projects[projectId];
    require(_msgSender() == project.owner, "Only owner can withdraw");
    require(project.depositTokens[tokenAddress] >= amount, "Insufficient balance");

    project.depositTokens[tokenAddress] -= amount;

    if (project.depositTokens[tokenAddress] == 0) {
      removeTokenAddress(project.tokenAddresses, tokenAddress);
    }

    if (tokenAddress != address(0)) { 
      IERC20 token = IERC20(tokenAddress);
      SafeERC20.safeTransfer(token, _msgSender(), amount);
    } else {
      (bool sent, ) = _msgSender().call{value: amount}("");
      require(sent, "Transfer failed");
    }

    // emit TokensWithdrawn(projectId, _msgSender(), tokenAddress, amount);
  }

  function assignUserToProject(
    string memory projectId, 
    address user
  ) 
    external 
    // updateProjectLastUpdatedTimestamp(projectId) 
  {
    require(isOwnerOrAssignedUser(projectId, _msgSender(), true), "Caller is not the owner or an assigned user");
    require(user != address(0), "Invalid user address");

    Project storage project = projects[projectId];

    require(user != project.owner, "Owner cannot be assigned as a user");

    for (uint i = 0; i < project.assignedUsers.length; i++) {
      require(project.assignedUsers[i] != user, "User already assigned");
    }

    project.assignedUsers.push(user);

    assignedUserProjects[user].push(projectId);

    // emit UserAssignedToProject(projectId, user);
  }

  function unassignUserFromProject(
    string memory projectId, 
    address user
  ) 
    external 
    // updateProjectLastUpdatedTimestamp(projectId) 
  {
    require(isOwnerOrAssignedUser(projectId, _msgSender(), true), "Caller is not the owner or an assigned user");
    require(user != address(0), "Invalid user address");

    Project storage project = projects[projectId];
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

    removeProjectFromAssignedUser(user, projectId);

    // emit UserUnassignedFromProject(projectId, user);
  }

  // function changeProjectName(
  //   string memory projectId, 
  //   string memory newName
  // ) external updateProjectLastUpdatedTimestamp(projectId) {
  //   require(bytes(newName).length > 0, "New name cannot be empty");
    
  //   Project storage project = projects[projectId];
  //   require(_msgSender() == project.owner, "Only the project owner can change the name");

  //   project.name = newName;

  //   emit ProjectNameChanged(projectId, newName);
  // }

  // function changeProjectOwner(
  //   string memory projectId, 
  //   address newOwner
  // ) external updateProjectLastUpdatedTimestamp(projectId) {
  //   require(newOwner != address(0), "Invalid new owner address");
  //   Project storage project = projects[projectId];
  //   require(_msgSender() == project.owner, "Only the current owner can change the project owner");
  //   for (uint i = 0; i < project.assignedUsers.length; i++) {
  //     require(project.assignedUsers[i] != newOwner, "New owner cannot be an assigned user");
  //   }

  //   removeProjectFromOwnerProjects(project.owner, projectId);
  //   ownerProjects[newOwner].push(projectId);

  //   project.owner = newOwner;

  //   emit ProjectOwnerChanged(projectId, newOwner);
  // }

  function deleteProject(string memory projectId) external returns (bool) {
    Project storage project = projects[projectId];
    require(_msgSender() == project.owner, "Only the project owner can delete the project");
    require(project.taskIds.length == 0, "Project cannot be deleted with remaining tasks");

    // string memory projectName = project.name;

    // for (uint i = 0; i < project.tokenAddresses.length; i++) {
    //   address tokenAddress = project.tokenAddresses[i];
    //   uint256 depositAmount = project.depositTokens[tokenAddress];

    //   project.depositTokens[tokenAddress] = 0;

    //   if (depositAmount > 0) {
    //     if (tokenAddress != address(0)) {
    //       IERC20 token = IERC20(tokenAddress);
    //       SafeERC20.safeTransfer(token, _msgSender(), depositAmount);
    //     } else {
    //       (bool sent, ) = _msgSender().call{value: depositAmount}("");
    //       require(sent, "Failed to send native token");
    //     }
    //   }
    // }
    require(project.tokenAddresses.length == 0, "Cannot delete project with remaining tokens");

    removeProjectId(projectId);
    removeProjectFromAssignedUsers(projectId, project);
    removeProjectFromOwnerProjects(_msgSender(), projectId);

    delete projects[projectId];

    // emit ProjectDeleted(projectId, _msgSender(), projectName);

    return true;
  }
  
  function createTask(
    string memory taskId,
    string memory projectId,
    address tokenAddress,
    uint256 lockedAmount,
    uint256 submissionDeadline,
    uint256 reviewDeadline,
    uint256 paymentDeadline
  ) 
    external 
    // updateProjectLastUpdatedTimestamp(projectId) 
    returns (string memory)
  {
    require(tasks[taskId].creator == address(0), "Task already exists");
    require(isOwnerOrAssignedUser(projectId, _msgSender(), false), "Sender is not assigned to the project");

    Project storage project = projects[projectId];
    require(lockedAmount > 0, "Locked amount must be greater than zero");
    require(project.depositTokens[tokenAddress] >= lockedAmount, "Insufficient funds in project");

    validateTaskDeadlines(submissionDeadline, reviewDeadline, paymentDeadline);

    Task storage task = tasks[taskId];
    task.projectId = projectId;
    task.creator = _msgSender();
    task.tokenAddress = tokenAddress;
    task.lockedAmount = lockedAmount;
    task.submissionDeadline = submissionDeadline;
    task.reviewDeadline = reviewDeadline;
    task.paymentDeadline = paymentDeadline;
    task.status = TaskStatus.Created;
    task.startTimestamp = block.timestamp;
    // task.lastUpdatedTimestamp = block.timestamp;

    // allTaskIds.push(taskId);

    projects[projectId].taskIds.push(taskId);

    project.depositTokens[tokenAddress] -= lockedAmount;

    if (project.depositTokens[tokenAddress] == 0) {
      removeTokenAddress(project.tokenAddresses, tokenAddress);
    }

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

    return taskId;
  }

  function assignRecipientToTask(string memory taskId) 
    external 
    updateStatus(taskId)
    // updateTaskLastUpdatedTimestamp(taskId)
  {
    Task storage task = tasks[taskId];
    // require(task.creator != address(0), "Task does not exist");
    require(task.status == TaskStatus.Created, "Task is not in Created status");
    require(!isOwnerOrAssignedUser(task.projectId, _msgSender(), true), "Owner or assigned user cannot be recipient");

    task.recipient = _msgSender();
    task.status = TaskStatus.InProgress;

    // emit RecipientAssignedToTask(taskId, _msgSender());
  }

  function submitTask(string memory taskId) 
    external 
    updateStatus(taskId)
    // updateTaskLastUpdatedTimestamp(taskId)
  {
    Task storage task = tasks[taskId];
    // require(task.creator != address(0), "Task does not exist");
    require(_msgSender() == task.recipient, "Only the recipient can submit the task");
    require(task.status == TaskStatus.InProgress, "Task is not in progress");

    task.status = TaskStatus.UnderReview;

    // emit TaskSubmitted(taskId);
  }

  function approveTask(string memory taskId) 
    external
    updateStatus(taskId)
    // updateTaskLastUpdatedTimestamp(taskId)
  {
    Task storage task = tasks[taskId];
    // require(task.creator != address(0), "Task does not exist");
    require(isOwnerOrAssignedUser(task.projectId, _msgSender(), false), "User is not assigned to the project");
    require(task.status == TaskStatus.UnderReview, "Task is not under review");

    task.status = TaskStatus.PendingPayment;

    // emit TaskApproved(taskId, _msgSender());
  }

  function transferTokensAndDeleteTask(string memory taskId) 
    external 
    updateStatus(taskId) 
    // updateProjectLastUpdatedTimestamp(tasks[taskId].projectId)
    returns (bool) 
  {
    Task storage task = tasks[taskId];
    // require(task.creator != address(0), "Task does not exist");

    bool shouldReleaseTokensToRecipient = false;

    if (task.status == TaskStatus.Created || task.status == TaskStatus.Unconfirmed || task.status == TaskStatus.SubmissionOverdue) {
      require(isOwnerOrAssignedUser(task.projectId, _msgSender(), false), "User is not assigned to the project");
    } else if (task.status == TaskStatus.DeletionRequested) {
      require(task.recipient == _msgSender(), "Only recipient can delete now");
    } else if (task.status == TaskStatus.LockedByDisapproval) {
      require(block.timestamp > task.lockReleaseTimestamp, "Lock period ongoing");
      require(isOwnerOrAssignedUser(task.projectId, _msgSender(), false), "User is not assigned to the project");
    } else if (task.status == TaskStatus.ReviewOverdue || task.status == TaskStatus.PaymentOverdue) {
      require(task.recipient == _msgSender(), "Only recipient can act");
      shouldReleaseTokensToRecipient = true;
    } else if (task.status == TaskStatus.PendingPayment) {
      require(projects[task.projectId].owner == _msgSender(), "Only project owner can act");
      shouldReleaseTokensToRecipient = true;
    } else {
      revert("Cannot transfer or delete in current status");
    }

    if (shouldReleaseTokensToRecipient) {
      releaseTokensToRecipient(taskId);
    } else {
      returnTokensToProject(taskId);
    }

    emit TaskProcessed(
      taskId,
      task.status,
      _msgSender(),
      task.recipient,
      shouldReleaseTokensToRecipient
    );

    deleteTask(taskId);

    return true;
  }

  function changeTaskDeadlines(
    string memory taskId,
    uint256 newSubmissionDeadline,
    uint256 newReviewDeadline,
    uint256 newPaymentDeadline
  ) 
    external 
    updateStatus(taskId)
    // updateTaskLastUpdatedTimestamp(taskId)
  {
    Task storage task = tasks[taskId];

    // require(task.creator != address(0), "Task does not exist");
    require(
      task.status == TaskStatus.Created || task.status == TaskStatus.Unconfirmed,
      "Task status must be Created or Unconfirmed"
    );
    require(isOwnerOrAssignedUser(task.projectId, _msgSender(), false), "User is not assigned to the project");

    updateTaskDeadlines(taskId, newSubmissionDeadline, newReviewDeadline, newPaymentDeadline);
    // TaskStatus oldStatus = task.status;

    if (task.status == TaskStatus.Unconfirmed) {
      task.status = TaskStatus.Created;
    }

    // emit TaskStatusChangedToCreatedFromUnconfirmed(taskId, oldStatus != task.status);
  }

  function requestTaskDeletion(string memory taskId) 
    external 
    updateStatus(taskId)
    // updateTaskLastUpdatedTimestamp(taskId)
  {
    Task storage task = tasks[taskId];
    // require(task.creator != address(0), "Task does not exist");
    require(task.deletionRequestTimestamp == 0, "Deletion request already made");
    require(isOwnerOrAssignedUser(task.projectId, _msgSender(), false), "User is not assigned to the project");
    require(task.status == TaskStatus.InProgress, "Task is not in progress");

    task.status = TaskStatus.DeletionRequested;
    task.deletionRequestTimestamp = block.timestamp;

    // emit TaskDeletionRequested(taskId, _msgSender());
  }

  function rejectDeletionRequest(string memory taskId) 
    external
    updateStatus(taskId)
    // updateTaskLastUpdatedTimestamp(taskId)
  {
    Task storage task = tasks[taskId];
    // require(task.creator != address(0), "Task does not exist");
    require(task.recipient == _msgSender(), "Only the recipient can reject the deletion request");
    require(task.status == TaskStatus.DeletionRequested, "Task is not in DeletionRequested status");

    task.status = TaskStatus.InProgress;

    // emit DeletionRequestRejected(taskId, _msgSender());
  }

  function requestDeadlineExtension(string memory taskId) 
    external
    updateStatus(taskId)
    // updateTaskLastUpdatedTimestamp(taskId)
  {
    Task storage task = tasks[taskId];
    // require(task.creator != address(0), "Task does not exist");
    require(isOwnerOrAssignedUser(task.projectId, _msgSender(), false), "User is not assigned to the project");
    require(task.status == TaskStatus.UnderReview, "Task is not under review");
    require(task.deadlineExtensionTimestamp == 0, "Deadline extension has already been requested");

    task.status = TaskStatus.DeadlineExtensionRequested;
    task.deadlineExtensionTimestamp = block.timestamp;

    // emit DeadlineExtensionRequested(taskId, _msgSender());
  }

  function approveDeadlineExtension(string memory taskId) 
    external 
    updateStatus(taskId)
    // updateTaskLastUpdatedTimestamp(taskId)
  {
    Task storage task = tasks[taskId];
    // require(task.creator != address(0), "Task does not exist");
    require(task.recipient == _msgSender(), "Only the recipient can approve deadline extension");
    require(task.status == TaskStatus.DeadlineExtensionRequested, "Task is not in deadline extension requested status");

    uint256 newSubmissionDeadline = task.submissionDeadline + (deadlineExtensionPeriodDays * 1 days);
    uint256 newReviewDeadline = task.reviewDeadline + (deadlineExtensionPeriodDays * 1 days);
    uint256 newPaymentDeadline = task.paymentDeadline + (deadlineExtensionPeriodDays * 1 days);

    updateTaskDeadlines(taskId, newSubmissionDeadline, newReviewDeadline, newPaymentDeadline);
    task.status = TaskStatus.InProgress;

    // emit DeadlineExtensionApproved(taskId);
  }

  function rejectDeadlineExtension(string memory taskId) 
    external 
    updateStatus(taskId)
    // updateTaskLastUpdatedTimestamp(taskId)
  {
    Task storage task = tasks[taskId];
    // require(task.creator != address(0), "Task does not exist");
    require(task.recipient == _msgSender(), "Only recipient can reject");
    require(task.status == TaskStatus.DeadlineExtensionRequested, "Task is not in deadline extension requested status");

    task.status = TaskStatus.UnderReview;

    // emit DeadlineExtensionRejected(taskId);
  }

  function disapproveSubmission(string memory taskId)
    external
    updateStatus(taskId)
    // updateTaskLastUpdatedTimestamp(taskId)
  {
    Task storage task = tasks[taskId];
    // require(task.creator != address(0), "Task does not exist");
    require(task.status == TaskStatus.UnderReview, "Task is not under review");
    require(isOwnerOrAssignedUser(task.projectId, _msgSender(), false), "User is not assigned to the project");
    require(task.deadlineExtensionTimestamp != 0, "Deadline extension has not been used");

    task.lockReleaseTimestamp = block.timestamp + (lockPeriodDays * 1 days);
    task.status = TaskStatus.LockedByDisapproval;

    // emit SubmissionDisapproved(taskId, _msgSender(), task.tokenAddress, task.lockedAmount, task.lockReleaseTimestamp);
  }

  // function setDeadlineExtensionPeriodDays(uint256 newPeriod) external onlyOwner {
  //   require(newPeriod > 0, "Extension period must be greater than 0");
  //   deadlineExtensionPeriodDays = newPeriod;
  // }

  // function updateTaskStatusByOwner(string memory taskId) external onlyOwner {
  //   updateTaskStatus(taskId);
  // }

  // function setMinSubmissionDeadlineDays(uint256 days) external onlyOwner {
  //   require(days > 0, "Minimum submission deadline days must be greater than 0");
  //   minSubmissionDeadlineDays = days;
  //   emit MinSubmissionDeadlineDaysUpdated(days);
  // }

  // function setMinReviewDeadlineDays(uint256 days) external onlyOwner {
  //   require(days > 0, "Minimum review deadline days must be greater than 0");
  //   minReviewDeadlineDays = days;
  //   emit MinReviewDeadlineDaysUpdated(days);
  // }

  // function setMinPaymentDeadlineDays(uint256 days) external onlyOwner {
  //   require(days > 0, "Minimum payment deadline days must be greater than 0");
  //   minPaymentDeadlineDays = days;
  //   emit MinPaymentDeadlineDaysUpdated(days);
  // }

  // function setLockPeriodDays(uint256 days) external onlyOwner {
  //   require(days > 0, "Lock period days must be greater than 0");
  //   lockPeriodDays = days;
  //   emit LockPeriodDaysUpdated(days);
  // }

  function generateProjectId(string memory name, address owner) private view returns (string memory) {
    return string(abi.encodePacked(name, "_", Strings.toHexString(uint256(keccak256(abi.encodePacked(block.timestamp, owner, block.prevrandao))), 32)));
  }

  function depositToken(
    string memory projectId,
    address tokenAddress,
    uint256 amount
  ) private {
    Project storage project = projects[projectId];
    require(amount > 0, "Amount must be > 0");

    if (tokenAddress == address(0)) {
      require(msg.value == amount, "Incorrect native token amount");
      project.depositTokens[address(0)] += amount;
      if (project.depositTokens[address(0)] == amount) {
        project.tokenAddresses.push(address(0));
      }
      emit TokenDeposited(projectId, address(0), amount);
    } else {
      if (project.depositTokens[tokenAddress] == 0) {
        project.tokenAddresses.push(tokenAddress);
      }
      project.depositTokens[tokenAddress] += amount;
      IERC20 token = IERC20(tokenAddress);
      SafeERC20.safeTransferFrom(token, _msgSender(), address(this), amount);
      emit TokenDeposited(projectId, tokenAddress, amount);
    }
  }

  function isOwnerOrAssignedUser(string memory projectId, address user, bool checkOwner) private view returns (bool) {
    Project storage project = projects[projectId];
    if (checkOwner && user == project.owner) {
      return true;
    }
    for (uint i = 0; i < project.assignedUsers.length; i++) {
      if (project.assignedUsers[i] == user) {
        return true;
      }
    }
    return false;
  }

  function validateTaskDeadlines(
    uint256 submissionDeadline,
    uint256 reviewDeadline,
    uint256 paymentDeadline
  ) private view {
    require(
      submissionDeadline >= block.timestamp + (minSubmissionDeadlineDays * 1 days), 
      "Submission deadline too soon"
    );

    require(
      reviewDeadline >= submissionDeadline + (minReviewDeadlineDays * 1 days), 
      "Review deadline too soon after submission"
    );

    require(
      paymentDeadline >= reviewDeadline + (minPaymentDeadlineDays * 1 days), 
      "Payment deadline too soon after review"
    );
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

  function updateTaskStatus(string memory taskId) 
    private
    // updateTaskLastUpdatedTimestamp(taskId)
  {
    Task storage task = tasks[taskId];
    require(task.lockedAmount != 0, "Task does not exist");
    
    if (task.status == TaskStatus.Created && block.timestamp > task.submissionDeadline) {
      task.status = TaskStatus.Unconfirmed;
    } else if (task.status == TaskStatus.InProgress && block.timestamp > task.submissionDeadline) {
      task.status = TaskStatus.SubmissionOverdue;
    } else if (task.status == TaskStatus.DeletionRequested && block.timestamp > task.submissionDeadline) {
      task.status = TaskStatus.SubmissionOverdue;
    } else if (task.status == TaskStatus.UnderReview && block.timestamp > task.reviewDeadline) {
      task.status = TaskStatus.ReviewOverdue;
    } else if (task.status == TaskStatus.PendingPayment && block.timestamp > task.paymentDeadline) {
      task.status = TaskStatus.PaymentOverdue;
    } else if (task.status == TaskStatus.DeadlineExtensionRequested && block.timestamp > task.deadlineExtensionTimestamp + 1 weeks) {
      uint256 newSubmissionDeadline = task.submissionDeadline + (deadlineExtensionPeriodDays * 1 days);
      uint256 newReviewDeadline = task.reviewDeadline + (deadlineExtensionPeriodDays * 1 days);
      uint256 newPaymentDeadline = task.paymentDeadline + (deadlineExtensionPeriodDays * 1 days);
      updateTaskDeadlines(taskId, newSubmissionDeadline, newReviewDeadline, newPaymentDeadline);
      task.status = TaskStatus.InProgress;
    } else if (task.deadlineExtensionTimestamp != 0 && task.status == TaskStatus.InProgress && block.timestamp > task.submissionDeadline) {
      task.status = TaskStatus.UnderReview;
    }

    emit TaskStatusUpdated(taskId, task.status);
  }

  function updateTaskDeadlines(
    string memory taskId,
    uint256 newSubmissionDeadline,
    uint256 newReviewDeadline,
    uint256 newPaymentDeadline
  ) private {
    Task storage task = tasks[taskId];
    // require(task.creator != address(0), "Task does not exist");

    validateTaskDeadlines(newSubmissionDeadline, newReviewDeadline, newPaymentDeadline);

    task.submissionDeadline = newSubmissionDeadline;
    task.reviewDeadline = newReviewDeadline;
    task.paymentDeadline = newPaymentDeadline;

    // emit TaskDeadlinesUpdated(taskId, newSubmissionDeadline, newReviewDeadline, newPaymentDeadline);
  }

  function releaseTokensToRecipient(string memory taskId) private {
    Task storage task = tasks[taskId];
    // require(task.creator != address(0), "Task does not exist");
    require(task.recipient != address(0), "Recipient not set");

    if (task.tokenAddress != address(0)) {
      IERC20 token = IERC20(task.tokenAddress);
      SafeERC20.safeTransfer(token, task.recipient, task.lockedAmount);
    } else {
      (bool sent, ) = task.recipient.call{value: task.lockedAmount}("");
      require(sent, "Failed to send native token");
    }

    // emit TokenTransfer(taskId, task.recipient, task.tokenAddress, task.lockedAmount);

    task.lockedAmount = 0;
  }

  function returnTokensToProject(string memory taskId) private {
    Task storage task = tasks[taskId];
    // require(task.creator != address(0), "Task does not exist");

    Project storage project = projects[task.projectId];
    project.depositTokens[task.tokenAddress] += task.lockedAmount;

    bool isTokenAddressExists = false;
    for (uint256 i = 0; i < project.tokenAddresses.length; i++) {
      if (project.tokenAddresses[i] == task.tokenAddress) {
        isTokenAddressExists = true;
        break;
      }
    }
    if (!isTokenAddressExists) {
      project.tokenAddresses.push(task.tokenAddress);
    }

    // emit TokenTransfer(taskId, address(0), task.tokenAddress, task.lockedAmount);

    task.lockedAmount = 0;
  }

  function deleteTask(string memory taskId) private {
    // require(tasks[taskId].creator != address(0), "Task does not exist");
    string memory projectId = tasks[taskId].projectId;
    uint256 taskIndex = findTaskIndexInProject(projectId, taskId);
    removeTaskFromProject(projectId, taskIndex);
    // removeTaskId(taskId);

    delete tasks[taskId];

    // emit TaskDeleted(taskId);
  }

  function findTaskIndexInProject(string memory projectId, string memory taskId) private view returns (uint256) {
    for (uint256 i = 0; i < projects[projectId].taskIds.length; i++) {
      if (keccak256(bytes(projects[projectId].taskIds[i])) == keccak256(bytes(taskId))) {
        return i;
      }
    }
    revert("Task not found in project");
  }

  function removeTaskFromProject(string memory projectId, uint256 taskIndex) private {
    projects[projectId].taskIds[taskIndex] = projects[projectId].taskIds[projects[projectId].taskIds.length - 1];
    projects[projectId].taskIds.pop();
  }

  // function removeTaskId(string memory taskId) private {
  //   for (uint256 i = 0; i < allTaskIds.length; i++) {
  //     if (keccak256(bytes(allTaskIds[i])) == keccak256(bytes(taskId))) {
  //       allTaskIds[i] = allTaskIds[allTaskIds.length - 1];
  //       allTaskIds.pop();
  //       break;
  //     }
  //   }
  // }

  function removeProjectFromAssignedUser(address user, string memory projectId) private {
    for (uint256 i = 0; i < assignedUserProjects[user].length; i++) {
      if (keccak256(bytes(assignedUserProjects[user][i])) == keccak256(bytes(projectId))) {
        assignedUserProjects[user][i] = assignedUserProjects[user][assignedUserProjects[user].length - 1];
        assignedUserProjects[user].pop();
        break;
      }
    }
  }

  function removeProjectFromOwnerProjects(address owner, string memory projectId) private {
    for (uint256 i = 0; i < ownerProjects[owner].length; i++) {
      if (keccak256(bytes(ownerProjects[owner][i])) == keccak256(bytes(projectId))) {
        ownerProjects[owner][i] = ownerProjects[owner][ownerProjects[owner].length - 1];
        ownerProjects[owner].pop();
        break;
      }
    }
  }

  function removeProjectId(string memory projectId) private {
    for (uint256 i = 0; i < allProjectIds.length; i++) {
      if (keccak256(bytes(allProjectIds[i])) == keccak256(bytes(projectId))) {
        allProjectIds[i] = allProjectIds[allProjectIds.length - 1];
        allProjectIds.pop();
        break;
      }
    }
  }

  function removeProjectFromAssignedUsers(string memory projectId, Project storage project) private {
    for (uint i = 0; i < project.assignedUsers.length; i++) {
      removeProjectFromUserProjects(project.assignedUsers[i], projectId);
    }
  }

  function removeProjectFromUserProjects(address user, string memory projectId) private {
    for (uint256 i = 0; i < assignedUserProjects[user].length; i++) {
      if (keccak256(bytes(assignedUserProjects[user][i])) == keccak256(bytes(projectId))) {
        assignedUserProjects[user][i] = assignedUserProjects[user][assignedUserProjects[user].length - 1];
        assignedUserProjects[user].pop();
        break;
      }
    }
  }

  // function _msgSender() internal view override(Context, ERC2771Context) returns (address) {
  //   return ERC2771Context._msgSender();
  // }

  // function _msgData() internal view override(Context, ERC2771Context) returns (bytes calldata) {
  //   return ERC2771Context._msgData();
  // }

  // function _contextSuffixLength() internal view override(Context, ERC2771Context) returns (uint256) {
  //   return ERC2771Context._contextSuffixLength();
  // }
}
