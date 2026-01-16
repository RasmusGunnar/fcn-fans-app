import * as Linking from 'expo-linking';

export function createPostDeepLink(postId: string): string {
  return Linking.createURL(`/post/${postId}`);
}
