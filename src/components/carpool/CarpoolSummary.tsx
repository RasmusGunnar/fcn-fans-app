import React, { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text } from '../ui/Text';
import { useAuth } from '../../auth/AuthProvider';
import { fetchCarpoolCatalog } from '../../services/carpoolApi';
import type { CarpoolCatalog } from '../../services/carpoolContract';
import { navigationRef } from '../../navigation/navigationRef';
import { CarpoolButton, cp } from './CarpoolControls';

export function CarpoolSummary({ fixtureId }: { fixtureId?: string }) {
  const { user } = useAuth();
  const [catalog, setCatalog] = useState<CarpoolCatalog | null>(null),
    [error, setError] = useState(false);
  useFocusEffect(
    useCallback(() => {
      let active = true;
      setError(false);
      if (!user) {
        setCatalog(null);
        return;
      }
      void fetchCarpoolCatalog(fixtureId)
        .then((data) => {
          if (active) setCatalog(data);
        })
        .catch(() => {
          if (active) {
            setError(true);
            setCatalog(null);
          }
        });
      return () => {
        active = false;
      };
    }, [fixtureId, user]),
  );
  // Backend decides away eligibility and rollout. Home/past fixtures never show transport.
  if (!catalog?.enabled || !catalog.fixture || !catalog.summary || (fixtureId && catalog.fixture.id !== fixtureId))
    return error && !fixtureId ? (
      <View style={cp.card}>
        <Text>Samkørsel kunne ikke hentes.</Text>
        <CarpoolButton
          label="Åbn samkørsel igen"
          onPress={() => navigationRef.navigate('Carpool')}
        />
      </View>
    ) : null;
  const selected = catalog.fixture.id;
  return (
    <View style={cp.card}>
      <Text variant="h3">{fixtureId ? 'Transport til kampen' : 'Away · Samkørsel'}</Text>
      <Text>
        {catalog.fixture.home_team} – {catalog.fixture.away_team}
      </Text>
      <Text variant="bodyBold">
        {catalog.summary.rides} biler · {catalog.summary.seats} ledige pladser
      </Text>
      {catalog.summary.origins.length ? (
        <Text variant="caption">{catalog.summary.origins.join(' · ')}</Text>
      ) : null}
      <View style={cp.row}>
        <CarpoolButton
          label="Find lift"
          onPress={() => navigationRef.navigate('Carpool', { fixtureId: selected })}
        />
        <CarpoolButton
          label="Jeg har plads"
          onPress={() => navigationRef.navigate('Carpool', { fixtureId: selected, mode: 'create' })}
        />
      </View>
    </View>
  );
}
