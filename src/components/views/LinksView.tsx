import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { defaultTheme } from '../../theme';
import { Card } from '../ui/Card';

const theme = defaultTheme;

interface Link {
  id: string;
  title: string;
  description: string;
  url: string;
  iconKey: keyof typeof Ionicons.glyphMap;
}

const links: Link[] = [
  {
    id: 'fcn-official',
    title: 'FC Nordsjælland (officiel)',
    description: 'Officiel hjemmeside',
    url: 'https://fcn.dk',
    iconKey: 'globe',
  },
  {
    id: 'fcn-facebook',
    title: 'FCN Facebook',
    description: 'Følg FCN på Facebook',
    url: 'https://facebook.com/fcnordsjaelland',
    iconKey: 'logo-facebook',
  },
  {
    id: 'fcn-instagram',
    title: 'FCN Instagram',
    description: 'Følg FCN på Instagram',
    url: 'https://instagram.com/fcnordsjaelland',
    iconKey: 'logo-instagram',
  },
  {
    id: 'fcn-podcast',
    title: "Nordsjælland Dreamin' (podcast)",
    description: 'Podcast om FC Nordsjælland',
    url: 'https://fcndreamin.libsyn.com/',
    iconKey: 'mic',
  },
  {
    id: 'superliga',
    title: 'Superligaen',
    description: 'Dansk fodbolds topliga',
    url: 'https://superligaen.dk',
    iconKey: 'football',
  },
  {
    id: 'dbu',
    title: 'Dansk Boldspil Union',
    description: 'Dansk fodboldforbund',
    url: 'https://dbu.dk',
    iconKey: 'shield',
  },
  {
    id: 'wikipedia',
    title: 'FC Nordsjælland (Wikipedia)',
    description: 'Wikipedia-artikel om FC Nordsjælland',
    url: 'https://da.wikipedia.org/wiki/FC_Nordsj%C3%A6lland',
    iconKey: 'book',
  },
];

function LinkCard({ link }: { link: Link }) {
  const handlePress = async () => {
    try {
      const canOpen = await Linking.canOpenURL(link.url);
      if (canOpen) {
        await Linking.openURL(link.url);
      } else {
        Alert.alert('Fejl', `Kan ikke åbne link: ${link.url}`);
      }
    } catch (error) {
      Alert.alert('Fejl', 'Kunne ikke åbne linket.');
    }
  };

  return (
    <Pressable onPress={handlePress}>
      <Card style={styles.card}>
        <View style={styles.cardContent}>
          <View style={styles.headerRow}>
            <View style={styles.iconBox}>
              <Ionicons
                name={link.iconKey}
                size={theme.components.icon.size.md}
                color={theme.colors.brand.accent}
              />
            </View>
            <View style={styles.titleBox}>
              <Text style={styles.linkTitle}>{link.title}</Text>
              <Text style={styles.linkDescription}>{link.description}</Text>
            </View>
            <Ionicons
              name="arrow-forward"
              size={theme.spacing[5]}
              color={theme.colors.text.secondary}
              style={styles.arrowIcon}
            />
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export interface LinksViewProps {
  /**
   * Optional additional spacing below content.
   * Used by parent screen to account for tab bar height.
   */
  paddingBottom?: number;
}

/**
 * LinksView: Displays a curated list of useful fan links.
 * - Static array of links (FCN official, social media, Superligaen, etc.)
 * - Card-based layout, tap to open URL
 * - Uses Linking.openURL for external navigation
 */
export function LinksView({ paddingBottom = 0 }: LinksViewProps) {
  return (
    <View style={[styles.container, paddingBottom > 0 && { paddingBottom }]}>
      {links.length === 0 ? (
        <Card style={styles.emptyCard}>
          <View style={styles.emptyContent}>
            <Ionicons
              name="link-outline"
              size={theme.components.icon.size.lg}
              color={theme.colors.text.secondary}
            />
            <Text style={styles.emptyText}>Ingen links tilgængelige</Text>
          </View>
        </Card>
      ) : (
        links.map((link) => <LinkCard key={link.id} link={link} />)
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
  },
  card: {
    width: '100%',
  },
  cardContent: {
    padding: theme.components.card.padding,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  iconBox: {
    width: theme.spacing[10],
    height: theme.spacing[10],
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.bg.subtle,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  titleBox: {
    flex: 1,
    gap: theme.spacing[1],
  },
  linkTitle: {
    color: theme.colors.text.primary,
    ...theme.typography.bodyBold,
  },
  linkDescription: {
    color: theme.colors.text.secondary,
    ...theme.typography.small,
  },
  arrowIcon: {
    flexShrink: 0,
  },
  emptyCard: {
    width: '100%',
  },
  emptyContent: {
    padding: theme.spacing[6],
    alignItems: 'center',
    gap: theme.spacing[3],
  },
  emptyText: {
    color: theme.colors.text.secondary,
    ...theme.typography.body,
  },
});
