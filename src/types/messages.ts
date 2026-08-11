import type { SharedLinkAttachment } from './externalShare';

export type DirectMessageReportReason = 'spam' | 'abuse' | 'harassment' | 'personal_info' | 'other';

export type ConversationType = 'direct' | 'group';
export type ConversationRole = 'owner' | 'admin' | 'member';

export type MessageType = 'text' | 'image' | 'image_text' | 'external_link' | 'external_link_text';

export type MessagePeer = {
  id: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
};

export type ConversationDetails = {
  id: string;
  type: ConversationType;
  name: string | null;
  avatarPath: string | null;
  avatarUrl: string | null;
  peer: MessagePeer | null;
  lastMessageAt: string | null;
  blocked: boolean;
  blockedByMe: boolean;
  memberCount: number;
  currentUserRole: ConversationRole;
  peerLastReadAt: string | null;
  peerLastReadMessageId: string | null;
};

export type ConversationSummary = ConversationDetails & {
  lastMessageId: string | null;
  lastMessageBody: string | null;
  lastMessageType: MessageType | null;
  lastMessageMediaPath: string | null;
  lastMessageExternalShare: SharedLinkAttachment | null;
  lastMessageSenderId: string | null;
  lastMessageSenderName: string | null;
  activityAt: string;
  unreadCount: number;
};

export type ConversationMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  senderDisplayName: string;
  senderUsername: string | null;
  senderAvatarUrl: string | null;
  clientMessageId: string;
  body: string | null;
  type: MessageType;
  mediaPath: string | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  mediaWidth: number | null;
  mediaHeight: number | null;
  mediaSizeBytes: number | null;
  externalShare: SharedLinkAttachment | null;
  createdAt: string;
  deletedAt: string | null;
};

export type DirectMessage = ConversationMessage;

export type SendMessageResult = {
  message: ConversationMessage;
  notificationJobIds: string[];
  notificationJobId: string | null;
  inserted: boolean;
};

export type MessageUserSearchResult = MessagePeer & {
  fanLevelKey: string | null;
  mutualCommunityCount: number;
};

export type GroupMember = MessagePeer & {
  role: ConversationRole;
  joinedAt: string;
};

export type InboxCursor = {
  activityAt: string;
  conversationId: string;
};

export type MessageCursor = {
  createdAt: string;
  messageId: string;
};

export type MessageMediaUpload = {
  path: string;
  mimeType: string;
  width: number;
  height: number;
  sizeBytes: number;
};
