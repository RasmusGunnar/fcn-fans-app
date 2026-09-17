/* eslint-env browser */
import React from 'react';
import { createRoot } from 'react-dom/client';
import { View, Text } from 'react-native';
import { WeeklyTopFanCard } from '../../../src/components/cards/WeeklyTopFanCard';

// Isolated presentation data, never sent to the app/backend.
window.calls = [];
function App() {
  const params = new URLSearchParams(location.search);
  const compact = params.get('phase') === 'older';
  const long = params.has('long');
  const withScore = params.has('score');
  return (
    <View style={{ padding: 16, gap: 16 }}>
      <Text style={{ fontSize: 12, color: '#66545C' }}>ISOLERET KOMPONENTTEST</Text>
      <WeeklyTopFanCard
        displayName={long ? 'En fan med et usædvanligt langt profilnavn' : 'Hønsefaderen'}
        avatarUrl={null}
        fanLevelKey="bronze"
        awardedAt={new Date(Date.now() - (compact ? 48 : 2) * 3600000).toISOString()}
        weeklyScore={withScore ? 42 : undefined}
        subtitle="Tak for engagementet i fællesskabet"
        onPressProfile={() => window.calls.push('profile')}
        onPressReference={
          params.has('reference') ? () => window.calls.push('reference') : undefined
        }
      />
    </View>
  );
}
createRoot(document.getElementById('root')).render(<App />);
