import type {
  EditMessageRequest,
  SendMessageRequest,
  UnsendMessageRequest,
} from "@bb/server-contract";

export interface SendThreadMessageMutationRequest extends SendMessageRequest {
  id: string;
}

export interface EditMessageMutationRequest extends EditMessageRequest {
  id: string;
}

export interface UnsendMessageMutationRequest extends UnsendMessageRequest {
  id: string;
}
