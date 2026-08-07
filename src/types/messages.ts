export type DirectMessageReportReason = 'spam' | 'abuse' | 'harassment' | 'personal_info' | 'other';

export type MessagePeer = {
  id: string;
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
};

export type ConversationDetails = {
  id: string;
  peer: MessagePeer;
  lastMessageAt: string | null;
  blocked: boolean;
  blockedByMe: boolean;
};

export type ConversationSummary = ConversationDetails & {
  lastMessageId: string;
  lastMessageBody: string;
  lastMessageSenderId: string;
  lastMessageAt: string;
  unreadCount: number;
};

export type DirectMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  body: string;
  createdAt: string;
  deletedAt: string | null;
};

export type SendMessageResult = {
  message: DirectMessage;
  notificationJobId: string | null;
  inserted: boolean;
};

export type MessageUserSearchResult = MessagePeer & {
  fanLevelKey: string | null;
  mutualCommunityCount: number;
};

export type InboxCursor = {
  lastMessageAt: string;
  conversationId: string;
};

export type MessageCursor = {
  createdAt: string;
  messageId: string;
};
