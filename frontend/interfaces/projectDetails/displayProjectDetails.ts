import {
  CreateProjectFormInterface,
  StoreFileDeliverableInterface,
} from "../index";

interface DisplayProjectDetailsInterface extends CreateProjectFormInterface {
  "Client's Wallet Address": `0x${string}`;
  "Lancer's Wallet Address": `0x${string}`;
  fileDeliverables: StoreFileDeliverableInterface[];
  textDeliverables: string[];
  DeadlineExtensionRequest: boolean;
  InDispute: boolean;
  RequestedDeadlineExtension: string;
  tokenAddress: string;
  createdBy: string;
}

export type { DisplayProjectDetailsInterface };
