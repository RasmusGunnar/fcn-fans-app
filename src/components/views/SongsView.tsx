import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { SongAccordionCard } from '../components/songs/SongAccordionCard';
import { SongSuggestCard } from '../components/songs/SongSuggestCard';
import { defaultTheme } from '../theme';

const theme = defaultTheme;

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

export interface SongsViewProps {
  /**
   * Optional additional spacing below content.
   * Used by parent screen to account for tab bar height.
   */
  paddingBottom?: number;
}

/**
 * Reusable SongsView component.
 * Renders a list of song accordion cards + suggest card.
 * Does NOT render AppHeader — parent (LibraryScreen) owns row header.
 * Navigation to Create modal is self-contained.
 */
export function SongsView({ paddingBottom = 0 }: SongsViewProps) {
  const navigation = useNavigation();
  const [expandedSongId, setExpandedSongId] = useState<string | null>(null);

  const toggleSong = (songId: string) => {
    setExpandedSongId(expandedSongId === songId ? null : songId);
  };

  const handleSuggestSong = () => {
    (navigation as any).navigate('Create');
  };

  return (
    <View style={[styles.container, paddingBottom > 0 && { paddingBottom }]}>
      {songs.map((song) => (
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
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: theme.spacing[4],
  },
});
