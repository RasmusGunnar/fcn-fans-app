import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { Match, Event } from "../types";
import { PrimaryButton } from "../components/PrimaryButton";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../../App";

export function MatchdayScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [matches, setMatches] = useState<Match[]>([]);
  const [events, setEvents] = useState<Event[]>([]);

  useEffect(() => {
    const qM = query(collection(db, "matches"), orderBy("dateTime"), limit(5));
    const unsubM = onSnapshot(qM, (snap) => setMatches(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
    const qE = query(collection(db, "events"), orderBy("startTime"), limit(15));
    const unsubE = onSnapshot(qE, (snap) => setEvents(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
    return () => { unsubM(); unsubE(); };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Kampdag</Text>

      <Text style={styles.h2}>Næste kamp (tilføj i Firestore)</Text>
      <FlatList
        data={matches}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.bold}>{item.homeAway === "home" ? "FCN vs" : "Ude mod"} {item.opponent}</Text>
            <Text style={styles.muted}>{new Date(item.dateTime).toLocaleString()} · {item.venue ?? ""}</Text>
            <View style={{ height: 10 }} />
            <PrimaryButton title="Opret mødested til denne kamp" onPress={() => nav.navigate("CreateEvent", { matchId: item.id })} />
          </View>
        )}
        ListEmptyComponent={<Text style={styles.muted}>Ingen kampe endnu.</Text>}
      />

      <Text style={styles.h2}>Offentlige events</Text>
      <FlatList
        data={events.filter(e => e.visibility === "public")}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.bold}>{item.title}</Text>
            <Text style={styles.muted}>{item.locationName} · {new Date(item.startTime).toLocaleString()}</Text>
            <View style={{ height: 10 }} />
            <PrimaryButton title="Åbn" onPress={() => nav.navigate("Event", { eventId: item.id })} />
          </View>
        )}
        ListEmptyComponent={<Text style={styles.muted}>Ingen offentlige events endnu.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  h1: { fontSize: 24, fontWeight: "800" },
  h2: { fontSize: 16, fontWeight: "700", marginTop: 14, marginBottom: 8 },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  bold: { fontWeight: "700" },
  muted: { opacity: 0.7 }
});
