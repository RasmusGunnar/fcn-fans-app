import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { db } from "../firebase";
import { Community, Event } from "../types";
import { doc, onSnapshot, collection, query, where, orderBy, limit } from "firebase/firestore";
import { PrimaryButton } from "../components/PrimaryButton";

type Props = NativeStackScreenProps<RootStackParamList, "CommunityHub">;

export default function CommunityHubScreen({ route, navigation }: Props) {
  const { communityId } = route.params;
  const [community, setCommunity] = useState<Community | null>(null);
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    const unsubC = onSnapshot(doc(db, "communities", communityId), (snap) => {
      if (snap.exists()) setCommunity({ id: snap.id, ...(snap.data() as any) });
    });

    const qEvents = query(
      collection(db, "events"),
      where("communityId", "==", communityId),
      orderBy("startTime", "asc"),
      limit(20)
    );

    const unsubE = onSnapshot(qEvents, (snap) => {
      setEvents(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });

    return () => { unsubC(); unsubE(); };
  }, [communityId]);

  const title = useMemo(() => community?.name ?? "Fællesskab", [community]);
  useEffect(() => { navigation.setOptions({ title }); }, [title, navigation]);

  return (
    <View style={styles.container}>
      {community && (
        <View style={styles.header}>
          <Text style={styles.h1}>{community.name}</Text>
          {!!community.description && <Text style={styles.muted}>{community.description}</Text>}
          <View style={{ height: 10 }} />
          <PrimaryButton title="+ Opret event" onPress={() => navigation.navigate("CreateEvent", { communityId })} />
        </View>
      )}

      <Text style={styles.h2}>Kommende lokale events</Text>
      <FlatList
        data={events}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.bold}>{item.title}</Text>
            <Text style={styles.muted}>{item.locationName} · {new Date(item.startTime).toLocaleString()}</Text>
            <View style={{ height: 10 }} />
            <PrimaryButton title="Åbn" onPress={() => navigation.navigate("Event", { eventId: item.id })} />
          </View>
        )}
        ListEmptyComponent={<Text style={styles.muted}>Ingen events endnu. Opret fx “Afgang fra Ganløse”.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 14 },
  h1: { fontSize: 22, fontWeight: "800" },
  h2: { fontSize: 16, fontWeight: "700", marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  bold: { fontWeight: "700" },
  muted: { opacity: 0.7 }
});
