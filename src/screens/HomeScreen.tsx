import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { collection, limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { Community, Match } from "../types";
import { spacing } from "../theme";

export function HomeScreen() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);

  useEffect(() => {
    const q1 = query(collection(db, "communities"), orderBy("name"), limit(5));
    const unsub1 = onSnapshot(q1, (snap) => {
      setCommunities(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });

    const q2 = query(collection(db, "matches"), orderBy("dateTime"), limit(3));
    const unsub2 = onSnapshot(q2, (snap) => {
      setMatches(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) })));
    });

    return () => { unsub1(); unsub2(); };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>Hjem</Text>

      <Text style={styles.h2}>Næste kampe</Text>
      <FlatList
        data={matches}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.bold}>{item.homeAway === "home" ? "FCN vs" : "Ude mod"} {item.opponent}</Text>
            <Text>{new Date(item.dateTime).toLocaleString()}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.muted}>Ingen kampe endnu. Tilføj én i Firestore (collection: matches).</Text>}
      />

      <View style={{ height: spacing.lg }} />

      <Text style={styles.h2}>Populære fællesskaber</Text>
      <FlatList
        data={communities}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.bold}>{item.name}</Text>
            <Text style={styles.muted}>{item.municipality ?? ""}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.muted}>Ingen fællesskaber endnu. Opret fx “Ganløse”.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  h1: { fontSize: 28, fontWeight: "800" },
  h2: { marginTop: 14, marginBottom: 8, fontSize: 16, fontWeight: "700" },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 10 },
  bold: { fontWeight: "700" },
  muted: { opacity: 0.7 }
});
