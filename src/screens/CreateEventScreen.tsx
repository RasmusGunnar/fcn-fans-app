import React, { useState } from "react";
import { View, Text, TextInput, StyleSheet, Alert, Switch } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../App";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../firebase";
import { PrimaryButton } from "../components/PrimaryButton";

type Props = NativeStackScreenProps<RootStackParamList, "CreateEvent">;

export function CreateEventScreen({ route, navigation }: Props) {
  const { communityId, matchId } = route.params ?? {};
  const [title, setTitle] = useState(matchId ? "Mødested før kampen" : "Afgang fra Ganløse");
  const [locationName, setLocationName] = useState(communityId ? "Ganløse (aftalt sted)" : "Farum Kro");
  const [startTime, setStartTime] = useState(new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16)); // yyyy-mm-ddThh:mm
  const [visibility, setVisibility] = useState<"community" | "public">(communityId ? "community" : "public");
  const [soloWelcome, setSoloWelcome] = useState(true);

  const create = async () => {
    try {
      const dt = new Date(startTime);
      if (isNaN(dt.getTime())) return Alert.alert("Ugyldigt tidspunkt", "Brug format: 2025-12-18T15:00");
      const ref = await addDoc(collection(db, "events"), {
        matchId: matchId ?? null,
        communityId: communityId ?? null,
        visibility,
        title: title.trim(),
        locationName: locationName.trim(),
        startTime: dt.getTime(),
        soloWelcome,
        createdBy: auth.currentUser?.uid,
        createdAt: Date.now(),
        createdAtServer: serverTimestamp(),
        attendanceCount: 0
      });
      navigation.replace("Event", { eventId: ref.id });
    } catch (e: any) {
      Alert.alert("Fejl", e?.message ?? "Ukendt fejl");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Titel</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} />

      <Text style={styles.label}>Sted</Text>
      <TextInput style={styles.input} value={locationName} onChangeText={setLocationName} />

      <Text style={styles.label}>Starttid (ISO, fx 2025-12-18T15:00)</Text>
      <TextInput style={styles.input} value={startTime} onChangeText={setStartTime} autoCapitalize="none" />

      <View style={styles.row}>
        <Text style={styles.label}>Kun for fællesskab?</Text>
        <Switch value={visibility === "community"} onValueChange={(v) => setVisibility(v ? "community" : "public")} />
      </View>

      <View style={styles.row}>
        <Text style={styles.label}>Velkommen hvis man kommer alene</Text>
        <Switch value={soloWelcome} onValueChange={setSoloWelcome} />
      </View>

      <View style={{ height: 16 }} />
      <PrimaryButton title="Opret event" onPress={create} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  label: { marginTop: 12, marginBottom: 6, fontWeight: "600", flex: 1 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }
});
