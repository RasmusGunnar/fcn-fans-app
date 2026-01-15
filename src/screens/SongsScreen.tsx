import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { AppHeader } from '../components/AppHeader';
import { SongAccordionCard } from '../components/songs/SongAccordionCard';
import { SongSuggestCard } from '../components/songs/SongSuggestCard';
import { colors, spacing, radius } from '../theme';

const songs = [
  {
    id: '1',
    title: 'Vi Er FCN',
    lyrics: `Vi er FCN, vi er FCN
Rød og hvid er vores farver
Vi er FCN, vi er FCN
Vi vinder hver kamp`,
    spotifyUrl: 'https://open.spotify.com/',
  },
  {
    id: '2',
    title: 'Nordsjælland Sang',
    lyrics: `Nordsjælland, Nordsjælland
Vi støtter vores hold
Nordsjælland, Nordsjælland
Vi er stolte af vores klub`,
    spotifyUrl: 'https://open.spotify.com/',
  },
  {
    id: '3',
    title: 'Heia FCN',
    lyrics: `Heia FCN, heia FCN
Vi synger højt og klart
Heia FCN, heia FCN
Vi er de bedste i landet`,
    spotifyUrl: 'https://open.spotify.com/',
  },
  {
    id: '4',
    title: 'Rød og Hvid',
    lyrics: `Rød og hvid, rød og hvid
Det er vores farver
Rød og hvid, rød og hvid
Vi holder sammen`,
    spotifyUrl: 'https://open.spotify.com/',
  },
  {
    id: '5',
    title: 'Vi Giver Aldrig Op',
    lyrics: `Vi giver aldrig op, aldrig op
Vi kæmper til det sidste
Vi giver aldrig op, aldrig op
FCN sejrer altid`,
    spotifyUrl: 'https://open.spotify.com/',
  },
];

export default function SongsScreen() {
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const [expandedSongId, setExpandedSongId] = useState<string | null>('1'); // Default expanded

  const toggleSong = (songId: string) => {
    setExpandedSongId(expandedSongId === songId ? null : songId);
  };

  const handleSuggestSong = () => {
    (navigation as any).navigate('Create');
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + spacing.lg }}
    >
      <AppHeader
        title="Sangbog"
        subtitle="Alle vores fansange"
        onPressProfile={() => (navigation as any).navigate('Profile')}
      />

      <View style={styles.content}>
        {songs.map(song => (
          <SongAccordionCard
            key={song.id}
            title={song.title}
            lyrics={song.lyrics}
            spotifyUrl={song.spotifyUrl}
            isExpanded={expandedSongId === song.id}
            onToggle={() => toggleSong(song.id)}
          />
        ))}

        <SongSuggestCard onPressSuggest={handleSuggestSong} />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    paddingTop: spacing.md,
  },
});