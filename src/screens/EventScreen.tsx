import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/types';
import { db } from '../firebase';
import {
  doc,
  onSnapshot,
  collection,
  query,
  orderBy,
  addDoc,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';
import { useAuth } from '../auth/AuthProvider';
import { Event, Message } from '../types';
import { PrimaryButton } from '../components/PrimaryButton';

type Props = NativeStackScreenProps<RootStackParamList, 'Event'>;

export default function EventScreen({ route, navigation }: Props) {
  const { eventId } = route.params;
  const [event, setEvent] = useState<Event | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [going, setGoing] = useState(false);
  const { user } = useAuth();

  useEffect(() => {
    const unsubE = onSnapshot(doc(db, 'events', eventId), (snap) => {
      if (snap.exists()) {
        const e = { id: snap.id, ...(snap.data() as any) } as Event;
        setEvent(e);
        navigation.setOptions({ title: e.title });
      }
    });

    const qM = query(collection(db, 'events', eventId, 'messages'), orderBy('createdAt', 'asc'));
    const unsubM = onSnapshot(qM, (snap) => {
      setMessages(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
    });

    return () => {
      unsubE();
      unsubM();
    };
  }, [eventId, navigation]);

  const toggleGoing = async () => {
    try {
      const uid = user?.id;
      if (!uid) return;
      const next = !going;
      setGoing(next);
      await setDoc(
        doc(db, 'events', eventId, 'attendees', uid),
        {
          status: next ? 'going' : 'not_going',
          updatedAt: Date.now(),
        },
        { merge: true },
      );
    } catch (e: any) {
      Alert.alert('Fejl', e?.message ?? 'Ukendt fejl');
    }
  };

  const send = async () => {
    try {
      const uid = user?.id;
      if (!uid) return;
      const t = text.trim();
      if (!t) return;
      setText('');
      await addDoc(collection(db, 'events', eventId, 'messages'), {
        uid,
        text: t,
        createdAt: Date.now(),
        createdAtServer: serverTimestamp(),
      });
    } catch (e: any) {
      Alert.alert('Fejl', e?.message ?? 'Ukendt fejl');
    }
  };

  const header = useMemo(() => {
    if (!event) return null;
    return (
      <View style={styles.header}>
        <Text style={styles.bold}>{event.locationName}</Text>
        <Text style={styles.muted}>{new Date(event.startTime).toLocaleString()}</Text>
        <View style={{ height: 10 }} />
        <PrimaryButton title={going ? 'Jeg kommer ikke' : 'Jeg kommer'} onPress={toggleGoing} />
        {!!event.soloWelcome && <Text style={styles.badge}>Kom-alene-venligt</Text>}
      </View>
    );
  }, [event, going]);

  return (
    <View style={styles.container}>
      <FlatList
        data={messages}
        keyExtractor={(i) => i.id}
        ListHeaderComponent={header}
        renderItem={({ item }) => (
          <View style={styles.msg}>
            <Text style={styles.msgText}>{item.text}</Text>
            <Text style={styles.msgMeta}>
              {item.uid.slice(0, 6)} · {new Date(item.createdAt).toLocaleTimeString()}
            </Text>
          </View>
        )}
      />

      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="Skriv en besked…"
        />
        <PrimaryButton title="Send" onPress={send} disabled={!text.trim()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, borderBottomWidth: 1 },
  bold: { fontWeight: '800', fontSize: 16 },
  muted: { opacity: 0.7 },
  badge: {
    marginTop: 10,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderRadius: 999,
    fontSize: 12,
  },
  msg: { padding: 12, borderBottomWidth: 1 },
  msgText: { fontSize: 15 },
  msgMeta: { marginTop: 4, fontSize: 11, opacity: 0.6 },
  composer: { flexDirection: 'row', gap: 10, padding: 12, borderTopWidth: 1, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 12, padding: 12 },
});
