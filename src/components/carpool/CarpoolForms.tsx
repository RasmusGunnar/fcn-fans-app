import React, { useState } from 'react';
import { Platform, Switch, View } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Text } from '../ui/Text';
import { commandCarpool } from '../../services/carpoolApi';
import { rideTime, parseApproxPoint, ROUTING_POINT_HELP, type CarpoolFixture, type CarpoolRide } from '../../services/carpoolContract';
import { cp, CarpoolButton, CarpoolChoices, CarpoolField, CarpoolVibes } from './CarpoolControls';

function TimeField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: Date;
  onChange: (d: Date) => void;
  disabled: boolean;
}) {
  const [mode, setMode] = useState<'date' | 'time' | null>(null);
  return (
    <View style={cp.stack}>
      <Text variant="bodyBold">
        {label}: {rideTime(value.toISOString())}
      </Text>
      <View style={cp.row}>
        <CarpoolButton
          label={`Vælg dato · ${label}`}
          disabled={disabled}
          onPress={() => setMode('date')}
        />
        <CarpoolButton
          label={`Vælg tid · ${label}`}
          disabled={disabled}
          onPress={() => setMode('time')}
        />
      </View>
      {mode ? (
        <>
          <DateTimePicker
            value={value}
            mode={mode}
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            is24Hour
            onChange={(event, date) => {
              if (Platform.OS !== 'ios') setMode(null);
              if (event.type === 'set' && date) onChange(date);
            }}
          />
          {Platform.OS === 'ios' ? (
            <CarpoolButton label="Færdig" onPress={() => setMode(null)} />
          ) : null}
        </>
      ) : null}
    </View>
  );
}
export function CarpoolRideForm({
  fixture,
  ride,
  onSaved,
}: {
  fixture: CarpoolFixture;
  ride?: CarpoolRide;
  onSaved: (id: string) => void;
}) {
  const [origin, setOrigin] = useState(ride?.origin_label ?? ''),
    [departure, setDeparture] = useState(
      () => new Date(ride?.departure_at ?? new Date(fixture.kickoff_at).getTime() - 3 * 3600000),
    );
  const [capacity, setCapacity] = useState(String(ride?.seat_capacity ?? 3)),
    [detour, setDetour] = useState(String(ride?.max_detour_minutes ?? 5));
  const [returnMode, setReturnMode] = useState<string>(
      ride?.return_departure_mode ?? 'after_match',
    ),
    [returnTime, setReturnTime] = useState(
      () =>
        new Date(ride?.return_departure_at ?? new Date(fixture.kickoff_at).getTime() + 3 * 3600000),
    );
  const [fuel, setFuel] = useState<string>(ride?.fuel_contribution_mode ?? 'agree'),
    [amount, setAmount] = useState(String(ride?.fuel_contribution_amount ?? ''));
  const [tags, setTags] = useState(ride?.vibe_tags ?? []),
    [note, setNote] = useState(ride?.note ?? ''),
    [adult, setAdult] = useState(Boolean(ride));
  const [pending, setPending] = useState(false),
    [error, setError] = useState('');
  const [point, setPoint] = useState('');
  async function submit() {
    if (pending) return;
    setError('');
    if (
      origin.trim().length < 2 ||
      !adult ||
      (fuel === 'fixed' && !(Number(amount.replace(',', '.')) > 0))
    ) {
      setError('Udfyld mødested, eventuelt beløb, og bekræft at du er fyldt 18 år.');
      return;
    }
    setPending(true);
    try {
      const result = await commandCarpool(ride ? 'update' : 'create', ride?.id, undefined, {
        fixture_id: fixture.id,
        origin_label: origin,
        ...(point.trim() ? { approx_origin: parseApproxPoint(point) } : {}),
        departure_at: departure.toISOString(),
        seat_capacity: Number(capacity),
        max_detour_minutes: Number(detour),
        return_departure_mode: returnMode,
        return_departure_at: returnMode === 'custom' ? returnTime.toISOString() : null,
        fuel_contribution_mode: fuel,
        fuel_contribution_amount: fuel === 'fixed' ? Number(amount.replace(',', '.')) : null,
        vibe_tags: tags,
        note,
        adult_confirmed: adult,
      });
      onSaved(result.ride_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Turen kunne ikke gemmes.');
    } finally {
      setPending(false);
    }
  }
  return (
    <View style={cp.card}>
      <Text variant="h3">{ride ? 'Redigér tur' : 'Jeg har plads'}</Text>
      <Text>
        {fixture.home_team} – {fixture.away_team}
      </Text>
      <Text variant="caption">{rideTime(fixture.kickoff_at)}</Text>
      <CarpoolField
        label="Hvor kører du fra?"
        value={origin}
        onChangeText={setOrigin}
        maxLength={80}
        placeholder="Farum eller Ballerup Station"
        editable={!pending}
      />
      <Text variant="caption">
        Vises til andre fans. Brug by, område eller mødested – ikke hjemmeadresse eller
        telefonnummer.
      </Text>
      <TimeField label="Afgang" value={departure} onChange={setDeparture} disabled={pending} />
      <CarpoolField label="Ruteestimat · mødestedets koordinater (valgfri)" value={point} onChangeText={setPoint} placeholder="55.81, 12.38" maxLength={45} editable={!pending} />
      <Text variant="caption">{ROUTING_POINT_HELP}</Text>
      <CarpoolChoices
        label="Ledige pladser i bilen"
        value={capacity}
        options={['1', '2', '3', '4'].map((n) => [n, n + ' ' + (n === '1' ? 'plads' : 'pladser')])}
        onChange={setCapacity}
        disabled={pending}
      />
      <CarpoolChoices
        label="Maksimal omvej"
        value={detour}
        options={['0', '5', '10', '15'].map((n) => [
          n,
          n === '0' ? 'Kun langs ruten' : '+' + n + ' min.',
        ])}
        onChange={setDetour}
        disabled={pending}
      />
      <CarpoolChoices
        label="Retur?"
        value={returnMode}
        options={[
          ['after_match', 'Hjem efter kampen'],
          ['custom', 'Andet tidspunkt'],
          ['none', 'Kun udrejse'],
        ]}
        onChange={setReturnMode}
        disabled={pending}
      />
      {returnMode === 'custom' ? (
        <TimeField
          label="Returafgang"
          value={returnTime}
          onChange={setReturnTime}
          disabled={pending}
        />
      ) : null}
      <CarpoolVibes value={tags} onChange={setTags} disabled={pending} />
      <CarpoolChoices
        label="Benzinbidrag"
        value={fuel}
        options={[
          ['agree', 'Aftales'],
          ['free', 'Gratis'],
          ['fixed', 'Fast beløb'],
        ]}
        onChange={setFuel}
        disabled={pending}
      />
      {fuel === 'fixed' ? (
        <CarpoolField
          label="Beløb pr. person (kr.)"
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          maxLength={7}
          editable={!pending}
        />
      ) : null}
      <CarpoolField
        label="Note (valgfri, offentlig)"
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={500}
        editable={!pending}
      />
      {!ride ? (
        <View style={cp.stack}>
          <Text>Jeg er fyldt 18 år og tilbyder plads som privat fan.</Text>
          <Switch
            accessibilityLabel="Jeg er fyldt 18 år"
            value={adult}
            onValueChange={setAdult}
            disabled={pending}
          />
        </View>
      ) : null}
      {error ? (
        <Text accessibilityRole="alert" style={cp.error}>
          {error}
        </Text>
      ) : null}
      <CarpoolButton
        label={pending ? 'Gemmer…' : ride ? 'Gem ændringer' : 'Opret samkørsel'}
        onPress={() => void submit()}
        disabled={pending}
        selected
      />
    </View>
  );
}
export function CarpoolRequestForm({ rideId, onSaved }: { rideId: string; onSaved: () => void }) {
  const [point, setPoint] = useState('');
  const [pickup, setPickup] = useState(''),
    [message, setMessage] = useState(''),
    [adult, setAdult] = useState(false),
    [tags, setTags] = useState<string[]>([]),
    [pending, setPending] = useState(false),
    [error, setError] = useState('');
  async function submit() {
    if (pending) return;
    if (pickup.trim().length < 2 || !adult) {
      setError('Vælg mødested og bekræft, at du er fyldt 18 år.');
      return;
    }
    setPending(true);
    setError('');
    try {
      await commandCarpool('request', rideId, undefined, {
        pickup_label: pickup,
        ...(point.trim() ? { approx_pickup: parseApproxPoint(point) } : {}),
        message,
        adult_confirmed: adult,
        requested_seats: 1,
        vibe_tags: tags,
      });
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Anmodningen kunne ikke sendes.');
    } finally {
      setPending(false);
    }
  }
  return (
    <View style={cp.card}>
      <Text variant="h3">Anmod om plads</Text>
      <CarpoolField
        label="Dit mødested / område"
        value={pickup}
        onChangeText={setPickup}
        maxLength={80}
        editable={!pending}
        placeholder="Fx Ballerup Station"
      />
      <Text variant="caption">
        Kun du og chaufføren kan se din anmodning. Aftal præcis afhentning efter godkendelse.
      </Text>
      <CarpoolField
        label="Besked til chaufføren (valgfri)"
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={500}
        editable={!pending}
      />
      <CarpoolField label="Ruteestimat · mødestedets koordinater (valgfri)" value={point} onChangeText={setPoint} placeholder="55.81, 12.38" maxLength={45} editable={!pending} />
      <Text variant="caption">{ROUTING_POINT_HELP}</Text>
      <CarpoolVibes value={tags} onChange={setTags} disabled={pending} />
      <Text>Jeg er fyldt 18 år og søger én plads til mig selv.</Text>
      <Switch
        accessibilityLabel="Jeg er fyldt 18 år og søger én plads"
        value={adult}
        onValueChange={setAdult}
        disabled={pending}
      />
      {error ? (
        <Text accessibilityRole="alert" style={cp.error}>
          {error}
        </Text>
      ) : null}
      <CarpoolButton
        label={pending ? 'Sender…' : 'Send anmodning'}
        onPress={() => void submit()}
        disabled={pending}
        selected
      />
    </View>
  );
}
