import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, RefreshControl, ScrollView, View } from 'react-native';
import {
  useFocusEffect,
  useNavigation,
  useRoute,
  type NavigationProp,
  type ParamListBase,
} from '@react-navigation/native';
import { AppHeader } from '../components/AppHeader';
import { Text } from '../components/ui/Text';
import {
  cp,
  CarpoolButton,
  CarpoolField,
  CarpoolPersonView,
} from '../components/carpool/CarpoolControls';
import { CarpoolRideForm, CarpoolRequestForm } from '../components/carpool/CarpoolForms';
import { fetchCarpoolCatalog, fetchCarpoolDetail, commandCarpool, refreshCarpoolRoute } from '../services/carpoolApi';
import { createOrGetDirectConversation, blockDirectMessageUser } from '../services/messagesApi';
import { navigateToDirectMessageConversation } from '../navigation/navigationRef';
import {
  REQUEST_LABEL,
  RIDE_LABEL,
  SAFETY_COPY,
  rideTime,
  returnLabel,
  fuelLabel,
  vibeLabel,
  routeAdvice,
  type CarpoolAction,
  type CarpoolCatalog,
  type CarpoolDetail,
  type CarpoolRide,
} from '../services/carpoolContract';

function confirm(label: string, onConfirm: () => void) {
  Alert.alert(label, 'Handlingen opdaterer turen og giver de berørte fans besked.', [
    { text: 'Fortryd', style: 'cancel' },
    { text: 'Bekræft', style: 'destructive', onPress: onConfirm },
  ]);
}
function RideCard({ ride, onOpen }: { ride: CarpoolRide; onOpen: () => void }) {
  return (
    <View style={cp.card}>
      <CarpoolPersonView person={ride.driver} />
      <Text variant="h3">
        {ride.origin_label} → {ride.fixture.home_team}
      </Text>
      <Text>Afgang {rideTime(ride.departure_at)}</Text>
      <Text variant="bodyBold">
        {ride.status === 'open'
          ? `${ride.available_seats} ledige pladser`
          : RIDE_LABEL[ride.status]}
      </Text>
      <Text>{returnLabel(ride)}</Text>
      <Text variant="caption">{ride.vibe_tags.map(vibeLabel).join(' · ')}</Text>
      <Text>
        {ride.is_driver
          ? `Din tur · ${ride.request_count ?? 0} nye forespørgsler`
          : ride.my_request_status
            ? REQUEST_LABEL[ride.my_request_status]
            : `Benzinbidrag: ${fuelLabel(ride)}`}
      </Text>
      <CarpoolButton label="Se tur" onPress={onOpen} />
    </View>
  );
}

export function NativeCarpoolDetail({
  detail,
  onRefresh,
}: {
  detail: CarpoolDetail;
  onRefresh: () => void;
}) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [edit, setEdit] = useState(false),
    [safety, setSafety] = useState(false),
    [reason, setReason] = useState('');
  const r = detail.ride,
    open = r.status === 'open' || r.status === 'full';
  async function run(
    action: CarpoolAction,
    requestId?: string,
    input: Record<string, unknown> = {},
  ) {
    if (pending) return;
    setPending(true);
    setError('');
    setNotice('');
    try {
      await commandCarpool(action, r.id, requestId, input);
      setNotice(
        action === 'report' ? 'Din anmeldelse er sendt til moderatorerne.' : 'Turen er opdateret.',
      );
      onRefresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Handlingen kunne ikke gennemføres.');
    } finally {
      setPending(false);
    }
  }
  async function dm(userId: string) {
    if (pending) return;
    setPending(true);
    try {
      navigateToDirectMessageConversation(await createOrGetDirectConversation(userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Beskeden kunne ikke åbnes.');
    } finally {
      setPending(false);
    }
  }
  async function estimate(requestId: string) {
    if (pending) return;
    setPending(true);
    try { await refreshCarpoolRoute(requestId); onRefresh(); }
    catch { setError('Omvej kunne ikke beregnes'); }
    finally { setPending(false); }
  }
  return (
    <View style={cp.content}>
      <View style={[cp.card, cp.hero]}>
        <Text variant="caption">
          {r.fixture.home_team} – {r.fixture.away_team}
        </Text>
        <Text variant="h2">
          {r.origin_label} → {r.fixture.home_team}
        </Text>
        <CarpoolPersonView person={r.driver} />
        <Text variant="bodyBold">
          {RIDE_LABEL[r.status]}{open ? ` · ${r.available_seats} ledige pladser` : ''}
        </Text>
        <Text>Afgang {rideTime(r.departure_at)}</Text>
        <Text>{r.fixture.venue}</Text>
        <Text>{returnLabel(r)}</Text>
        <Text variant="caption">{r.vibe_tags.map(vibeLabel).join(' · ')}</Text>
      </View>
      <Text>Benzinbidrag: {fuelLabel(r)} · betaling aftales mellem jer</Text>
      <Text variant="caption">
        Maksimal omvej: {r.max_detour_minutes} min. Ruteestimat er vejledende; chaufføren beslutter.
      </Text>
      {r.note ? <Text>{r.note}</Text> : null}
      {error ? (
        <Text accessibilityRole="alert" style={cp.error}>
          {error}
        </Text>
      ) : null}
      {notice ? <Text accessibilityLiveRegion="polite">{notice}</Text> : null}
      <CarpoolButton label="Opdatér tur" onPress={onRefresh} disabled={pending} />
      {detail.my_request ? (
        <View style={cp.card}>
          <Text variant="h3">Din anmodning: {REQUEST_LABEL[detail.my_request.status]}</Text>
          <Text>
            {detail.my_request.pickup_label} · {returnLabel(r)}
          </Text>
          <Text variant="caption">{routeAdvice(detail.my_request.detour_estimate_minutes, r.max_detour_minutes)}</Text>
          {open && ['pending', 'accepted'].includes(detail.my_request.status) ? <CarpoolButton label="Beregn omvej" disabled={pending} onPress={() => void estimate(detail.my_request!.id)} /> : null}
          {['pending', 'accepted'].includes(detail.my_request.status) ? (
            <CarpoolButton
              disabled={pending}
              label={
                detail.my_request.status === 'accepted'
                  ? 'Aflys min plads'
                  : 'Træk anmodning tilbage'
              }
              onPress={() => confirm('Aflys din plads / anmodning?', () => void run('withdraw'))}
            />
          ) : null}
        </View>
      ) : null}
      {detail.can_request ? <CarpoolRequestForm rideId={r.id} onSaved={onRefresh} /> : null}
      {detail.conversation_id ? (
        <View style={cp.card}>
          <Text variant="h3">Jeres tur</Text>
          <Text>
            {returnLabel(r)}. Pickup aftales i chatten.
            {!open ? ' Chatten er nu skrivebeskyttet.' : ''}
          </Text>
          <CarpoolButton
            label={open ? 'Åbn turchat' : 'Se turchat'}
            onPress={() => navigateToDirectMessageConversation(detail.conversation_id!)}
            selected
          />
          <Text variant="bodyBold">Deltagere</Text>
          <CarpoolPersonView person={r.driver} />
          {detail.members.map((p) => (
            <CarpoolPersonView key={p.id} person={p} />
          ))}
        </View>
      ) : null}
      {r.is_driver ? (
        <View style={cp.stack}>
          <Text variant="h2">Administrér tur</Text>
          {open ? (
            <View style={cp.row}>
              {detail.enabled ? (
                <CarpoolButton
                  label={edit ? 'Luk redigering' : 'Redigér tur'}
                  onPress={() => setEdit(!edit)}
                  disabled={pending}
                />
              ) : null}
              <CarpoolButton
                label="Aflys tur"
                disabled={pending}
                onPress={() => confirm('Aflys hele turen?', () => void run('cancel'))}
              />
            </View>
          ) : null}
          {edit && open && detail.enabled ? (
            <CarpoolRideForm
              fixture={r.fixture}
              ride={r}
              onSaved={() => {
                setEdit(false);
                onRefresh();
              }}
            />
          ) : null}
          <Text variant="h3">
            Forespørgsler ({detail.requests.filter((q) => q.status === 'pending').length} nye)
          </Text>
          {!detail.requests.length ? <Text>Ingen anmodninger endnu.</Text> : null}
          {detail.requests.map((q) => (
            <View key={q.id} style={cp.card}>
              <CarpoolPersonView person={q.profile} />
              {q.can_message ? (
                <CarpoolButton
                  label="Skriv besked"
                  disabled={pending}
                  onPress={() => void dm(q.profile.id)}
                />
              ) : null}
              <Text variant="bodyBold">
                {REQUEST_LABEL[q.status]} · {q.pickup_label}
              </Text>
              <Text variant="caption">
                {routeAdvice(q.detour_estimate_minutes, r.max_detour_minutes)}
              </Text>
              {open && ['pending', 'accepted'].includes(q.status) ? <CarpoolButton label="Beregn omvej" disabled={pending} onPress={() => void estimate(q.id)} /> : null}
              {q.message ? <Text>{q.message}</Text> : null}
              <Text variant="caption">{q.vibe_tags.map(vibeLabel).join(' · ')}</Text>
              {q.status === 'pending' && open && detail.enabled ? (
                <View style={cp.row}>
                  <CarpoolButton
                    label="Godkend plads"
                    disabled={pending || r.available_seats < 1}
                    selected
                    onPress={() => void run('accept', q.id)}
                  />
                  <CarpoolButton
                    label="Afvis"
                    disabled={pending}
                    onPress={() => void run('reject', q.id)}
                  />
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <View style={cp.stack}>
          <CarpoolButton label="Tryghed · anmeld eller blokér" onPress={() => setSafety(!safety)} />
          {safety ? (
            <>
              <CarpoolField
                label="Hvorfor anmelder du turen?"
                value={reason}
                onChangeText={setReason}
                maxLength={500}
                multiline
                editable={!pending}
              />
              <CarpoolButton
                label="Send anmeldelse"
                disabled={pending || reason.trim().length < 2}
                onPress={() => void run('report', undefined, { reason })}
              />
              <CarpoolButton
                label="Blokér bruger"
                disabled={pending}
                onPress={() =>
                  Alert.alert('Blokér chaufføren?', 'Din plads aflyses ikke automatisk.', [
                    { text: 'Fortryd', style: 'cancel' },
                    {
                      text: 'Blokér',
                      style: 'destructive',
                      onPress: () => {
                        setPending(true);
                        void blockDirectMessageUser(r.driver.id)
                          .then(() => {
                            setNotice('Brugeren er blokeret. Du kan stadig aflyse din plads.');
                            onRefresh();
                          })
                          .catch(() => setError('Blokering kunne ikke gemmes.'))
                          .finally(() => setPending(false));
                      },
                    },
                  ])
                }
              />
            </>
          ) : null}
        </View>
      )}
      <Text variant="caption">{SAFETY_COPY}</Text>
    </View>
  );
}
export default function CarpoolScreen() {
  const navigation = useNavigation<NavigationProp<ParamListBase>>(),
    route = useRoute();
  const { fixtureId, rideId, mode } = (route.params ?? {}) as {
    fixtureId?: string;
    rideId?: string;
    mode?: string;
  };
  const [catalog, setCatalog] = useState<CarpoolCatalog | null>(null),
    [detail, setDetail] = useState<CarpoolDetail | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  const requestVersion = useRef(0);
  const load = useCallback(async () => {
      const version = ++requestVersion.current;
      setLoading(true);
      setError('');
      await (
        rideId
          ? fetchCarpoolDetail(rideId).then((data) => {
              if (version === requestVersion.current) setDetail(data);
            })
          : fetchCarpoolCatalog(fixtureId).then((data) => {
              if (version === requestVersion.current) setCatalog(data);
            })
      )
        .catch((e) => {
          if (version === requestVersion.current) {
            setError(e instanceof Error ? e.message : 'Ture kunne ikke hentes.');
            setDetail(null);
            setCatalog(null);
          }
        })
        .finally(() => {
          if (version === requestVersion.current) setLoading(false);
        });
  }, [rideId, fixtureId]);
  const refresh = () => { void load(); };
  useFocusEffect(useCallback(() => {
    void load();
    let previousState = AppState.currentState;
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active' && previousState !== 'active') void load();
      previousState = nextState;
    });
    return () => { subscription.remove(); requestVersion.current++; };
  }, [load]));
  const openRide = (id: string) => navigation.navigate('CarpoolRide', { rideId: id });
  return (
    <View style={cp.screen}>
      <AppHeader title="Samkørsel" subtitle="Til kampen. Sammen." showProfileButton={false} />
      <CarpoolButton
        label="Tilbage"
        onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate('Main'))}
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      >
        {loading ? (
          <ActivityIndicator accessibilityLabel="Henter samkørsel" />
        ) : error ? (
          <View style={cp.content}>
            <Text accessibilityRole="alert" style={cp.error}>
              {error}
            </Text>
            <CarpoolButton label="Prøv igen" onPress={refresh} />
          </View>
        ) : rideId && detail ? (
          <NativeCarpoolDetail detail={detail} onRefresh={refresh} />
        ) : catalog ? (
          <View style={cp.content}>
            {!catalog.enabled ? (
              <Text>
                Samkørsel åbner senere. Eksisterende ture kan stadig åbnes fra dine notifikationer.
              </Text>
            ) : (
              <>
                <Text variant="h2">Find nogen at tage til udebanekamp med</Text>
                <Text variant="bodyBold">Vælg udebanekamp</Text>
                {catalog.fixtures.map((f) => (
                  <CarpoolButton
                    key={f.id}
                    label={`${f.home_team} – ${f.away_team} · ${rideTime(f.kickoff_at)}`}
                    selected={catalog.fixture?.id === f.id}
                    onPress={() => navigation.setParams({ fixtureId: f.id, mode: undefined })}
                  />
                ))}
                {catalog.fixture ? (
                  <>
                    <Text>
                      {catalog.summary?.rides ?? 0} biler · {catalog.summary?.seats ?? 0} ledige
                      pladser
                    </Text>
                    <View style={cp.row}>
                      <CarpoolButton
                        label="Jeg søger lift"
                        selected={mode !== 'create'}
                        onPress={() => navigation.setParams({ mode: undefined })}
                      />
                      <CarpoolButton
                        label="Jeg har plads"
                        selected={mode === 'create'}
                        onPress={() => navigation.setParams({ mode: 'create' })}
                      />
                    </View>
                    {mode === 'create' ? (
                      <CarpoolRideForm
                        key={catalog.fixture.id}
                        fixture={catalog.fixture}
                        onSaved={openRide}
                      />
                    ) : (
                      <>
                        <Text variant="caption">
                          Sorteret efter afgang og ledige pladser. Omvej beregnes ikke endnu – aftal
                          mødested med chaufføren.
                        </Text>
                        {catalog.rides.length ? (
                          catalog.rides.map((r) => (
                            <RideCard key={r.id} ride={r} onOpen={() => openRide(r.id)} />
                          ))
                        ) : (
                          <Text>Ingen biler til kampen endnu. Har du plads?</Text>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <Text>Ingen tilgængelig kommende udebanekamp.</Text>
                )}
                {catalog.mine.length ? (
                  <>
                    <Text variant="h2">Dine ture og anmodninger</Text>
                    {catalog.mine.map((r) => (
                      <RideCard key={r.id} ride={r} onOpen={() => openRide(r.id)} />
                    ))}
                  </>
                ) : null}
              </>
            )}
            <Text variant="caption">{SAFETY_COPY}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}
