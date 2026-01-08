import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";
import { db } from "../firebase";
import { Community } from "../types";
import { PrimaryButton } from "../components/PrimaryButton";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RootStackParamList } from "../navigation/types";

export default function CommunitiesScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<Community[]>([]);

  useEffect(() => {
    const q = query(collection(db, "communities"), orderBy("name"));
    return onSnapshot(q, (snap) => setItems(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) }))));
  }, []);

  return (
    <View style={styles.container}>
      <View style={styles.row}>
        <Text style={styles.h1}>Fællesskaber</Text>
        <PrimaryButton title="Opret" onPress={() => nav.navigate("CreateCommunity")} />
      </View>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.bold}>{item.name}</Text>
            {!!item.municipality && <Text style={styles.muted}>{item.municipality}</Text>}
            <View style={{ height: 10 }} />
            <PrimaryButton title="Åbn" onPress={() => nav.navigate("CommunityHub", { communityId: item.id })} />
          </View>
        )}
        ListEmptyComponent={<Text style={styles.muted}>Ingen fællesskaber endnu.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  h1: { fontSize: 24, fontWeight: "800" },
  card: { borderWidth: 1, borderRadius: 14, padding: 12, marginBottom: 12 },
  bold: { fontWeight: "700", fontSize: 16 },
  muted: { opacity: 0.7 }
});
