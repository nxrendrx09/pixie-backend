import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Animated,
  Alert, ActivityIndicator, StatusBar, Dimensions
} from 'react-native';
import { Audio } from 'expo-av';
import { Camera, CameraType } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import { io } from 'socket.io-client';

const { width } = Dimensions.get('window');

// ─── !! IMPORTANT: Replace this with your Render URL after deploying !! ───────
const BACKEND_URL = 'https://YOUR-APP-NAME.onrender.com';
// ─────────────────────────────────────────────────────────────────────────────

// ─── Pixie Avatar ─────────────────────────────────────────────────────────────
const PixieAvatar = ({ state }) => {
  const floatAnim  = useRef(new Animated.Value(0)).current;
  const scaleAnim  = useRef(new Animated.Value(1)).current;
  const glowAnim   = useRef(new Animated.Value(0.4)).current;

  // Idle float — always runs
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(floatAnim, { toValue: -7, duration: 1800, useNativeDriver: true }),
      Animated.timing(floatAnim, { toValue:  0, duration: 1800, useNativeDriver: true }),
    ])).start();
  }, []);

  // State-specific animations
  useEffect(() => {
    scaleAnim.stopAnimation();
    glowAnim.stopAnimation();

    if (state === 'listening') {
      Animated.loop(Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.08, duration: 500, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 1.00, duration: 500, useNativeDriver: true }),
      ])).start();
      Animated.loop(Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1.0, duration: 500, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0.4, duration: 500, useNativeDriver: false }),
      ])).start();
    } else if (state === 'speaking') {
      Animated.loop(Animated.sequence([
        Animated.timing(scaleAnim, { toValue: 1.04, duration: 180, useNativeDriver: true }),
        Animated.timing(scaleAnim, { toValue: 0.98, duration: 180, useNativeDriver: true }),
      ])).start();
      Animated.loop(Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1.0, duration: 400, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0.5, duration: 400, useNativeDriver: false }),
      ])).start();
    } else if (state === 'thinking') {
      Animated.loop(Animated.sequence([
        Animated.timing(glowAnim, { toValue: 0.7, duration: 700, useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0.2, duration: 700, useNativeDriver: false }),
      ])).start();
      scaleAnim.setValue(1);
    } else {
      // idle / happy / sad
      Animated.timing(scaleAnim, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      Animated.timing(glowAnim,  { toValue: 0.4, duration: 300, useNativeDriver: false }).start();
    }
  }, [state]);

  const colors = {
    idle: '#7C3AED', listening: '#2563EB', thinking: '#D97706',
    speaking: '#059669', happy: '#DB2777', sad: '#6B7280'
  };
  const emojis = {
    idle: '😊', listening: '👂', thinking: '🤔',
    speaking: '💬', happy: '😄', sad: '🥺'
  };
  const labels = {
    idle: 'Pixie is here ✨', listening: 'Listening...', thinking: 'Thinking...',
    speaking: 'Speaking...', happy: 'Yay!', sad: 'Here for you 💜'
  };

  const color = colors[state] || colors.idle;

  return (
    <View style={styles.avatarSection}>
      <Animated.View style={[styles.glowRing, { borderColor: color, opacity: glowAnim }]} />
      <Animated.View style={{ transform: [{ translateY: floatAnim }, { scale: scaleAnim }], alignItems: 'center' }}>
        <View style={[styles.avatarCircle, { backgroundColor: color }]}>
          <Text style={styles.avatarEmoji}>{emojis[state] || '😊'}</Text>
        </View>
        {state === 'speaking' && (
          <View style={styles.waveBars}>
            {[0,1,2,3,4].map(i => (
              <View key={i} style={[styles.waveBar, { backgroundColor: color, height: 6 + (i % 3) * 6 }]} />
            ))}
          </View>
        )}
      </Animated.View>
      <Text style={[styles.stateLabel, { color }]}>{labels[state] || ''}</Text>
    </View>
  );
};

// ─── Message Bubble ────────────────────────────────────────────────────────────
const Bubble = ({ msg }) => {
  const isPixie = msg.role === 'assistant';
  const time = new Date(msg.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  return (
    <View style={[styles.bubbleRow, isPixie ? styles.rowLeft : styles.rowRight]}>
      {isPixie && <View style={styles.pixieDot} />}
      <View style={[styles.bubble, isPixie ? styles.bubblePixie : styles.bubbleUser]}>
        <Text style={[styles.bubbleText, isPixie ? styles.textPixie : styles.textUser]}>{msg.content}</Text>
        <Text style={styles.bubbleTime}>{time}</Text>
      </View>
    </View>
  );
};

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [messages,      setMessages]      = useState([]);
  const [input,         setInput]         = useState('');
  const [avatarState,   setAvatarState]   = useState('idle');
  const [loading,       setLoading]       = useState(false);
  const [cameraOpen,    setCameraOpen]    = useState(false);
  const [cameraPerms,   setCameraPerms]   = useState(false);
  const scrollRef  = useRef(null);
  const cameraRef  = useRef(null);
  const soundRef   = useRef(null);
  const socketRef  = useRef(null);

  // ── Permissions + Socket setup ──────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const { status: cam } = await Camera.requestCameraPermissionsAsync();
      setCameraPerms(cam === 'granted');
      await Audio.requestPermissionsAsync();
      await MediaLibrary.requestPermissionsAsync();
    })();

    socketRef.current = io(BACKEND_URL, { transports: ['websocket'] });
    socketRef.current.on('morning_briefing', ({ content, audio }) => {
      addMsg({ role: 'assistant', content, timestamp: new Date() });
      if (audio) playAudio(audio);
    });
    return () => socketRef.current?.disconnect();
  }, []);

  // ── Load history ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetch(`${BACKEND_URL}/api/history`)
      .then(r => r.json())
      .then(data => setMessages(Array.isArray(data) ? data.slice(-50) : []))
      .catch(() => setMessages([{
        role: 'assistant',
        content: 'Heyy! Main hoon Pixie — tumhari personal AI. Kaise ho aaj? 😊',
        timestamp: new Date()
      }]));
  }, []);

  const addMsg = (msg) => setMessages(prev => [...prev, msg]);

  // ── Play audio ──────────────────────────────────────────────────────────────
  const playAudio = async (base64Audio) => {
    try {
      if (soundRef.current) { await soundRef.current.unloadAsync(); soundRef.current = null; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const uri = FileSystem.cacheDirectory + 'pixie_reply.mp3';
      await FileSystem.writeAsStringAsync(uri, base64Audio, { encoding: FileSystem.EncodingType.Base64 });
      const { sound } = await Audio.Sound.createAsync({ uri });
      soundRef.current = sound;
      setAvatarState('speaking');
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate(s => { if (s.didJustFinish) setAvatarState('idle'); });
    } catch (e) {
      console.error('Audio error:', e.message);
      setAvatarState('idle');
    }
  };

  // ── Send message ────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text, imageBase64 = null, imageType = null) => {
    const msg = (text || '').trim();
    if (!msg && !imageBase64) return;
    if (loading) return;

    addMsg({ role: 'user', content: msg || 'Sent a photo', timestamp: new Date() });
    setInput('');
    setLoading(true);
    setAvatarState('thinking');

    try {
      const body = { message: msg };
      if (imageBase64) { body.imageBase64 = imageBase64; body.imageType = imageType; }

      const res  = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      addMsg({ role: 'assistant', content: data.reply, timestamp: new Date() });

      if (data.audio) {
        await playAudio(data.audio);
      } else {
        const s = data.mood === 'happy' ? 'happy' : data.mood === 'sad' ? 'sad' : 'idle';
        setAvatarState(s);
        setTimeout(() => setAvatarState('idle'), 2500);
      }
    } catch (e) {
      addMsg({ role: 'assistant', content: 'Arre, network issue lag raha hai. Dobara try karo!', timestamp: new Date() });
      setAvatarState('idle');
    }
    setLoading(false);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [loading]);

  // ── Camera capture ──────────────────────────────────────────────────────────
  const capturePhoto = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      setCameraOpen(false);
      await sendMessage('Pixie, yeh dekh — isme kya hai?', photo.base64, 'image/jpeg');
    } catch (e) { Alert.alert('Camera error', e.message); }
  };

  // ── Gallery picker ──────────────────────────────────────────────────────────
  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, base64: true, quality: 0.5
    });
    if (!result.canceled && result.assets?.[0]) {
      await sendMessage('Pixie, is photo mein kya dikh raha hai?', result.assets[0].base64, 'image/jpeg');
    }
  };

  // ── Camera screen ───────────────────────────────────────────────────────────
  if (cameraOpen) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000' }}>
        <Camera style={StyleSheet.absoluteFillObject} ref={cameraRef} type={CameraType.back} />
        <View style={styles.camControls}>
          <TouchableOpacity style={styles.camCancel} onPress={() => setCameraOpen(false)}>
            <Text style={{ color: '#fff', fontSize: 20 }}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.camCapture} onPress={capturePhoto}>
            <View style={styles.camCaptureInner} />
          </TouchableOpacity>
          <View style={{ width: 48 }} />
        </View>
        <Text style={styles.camHint}>Show Pixie anything — she'll tell you about it</Text>
      </View>
    );
  }

  // ── Main screen ─────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor="#0F0A1E" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerDot} />
        <View>
          <Text style={styles.headerName}>Pixie</Text>
          <Text style={styles.headerSub}>your personal AI</Text>
        </View>
      </View>

      {/* Avatar */}
      <PixieAvatar state={avatarState} />

      {/* Messages */}
      <ScrollView
        ref={scrollRef} style={styles.msgList}
        contentContainerStyle={{ padding: 16, gap: 10 }}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((m, i) => <Bubble key={i} msg={m} />)}
        {loading && (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14 }}>
            <ActivityIndicator size="small" color="#7C3AED" />
            <Text style={{ color: '#6B7280', fontSize: 13 }}>Pixie soch rahi hai...</Text>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => cameraPerms ? setCameraOpen(true) : Alert.alert('Camera permission needed')}>
          <Text style={{ fontSize: 20 }}>📷</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={pickFromGallery}>
          <Text style={{ fontSize: 20 }}>🖼️</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.textInput} value={input} onChangeText={setInput}
          placeholder="Pixie se baat karo..." placeholderTextColor="#6B7280"
          multiline maxLength={500}
          onFocus={() => setAvatarState('listening')}
          onBlur={() => !loading && setAvatarState('idle')}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || loading) && styles.sendDisabled]}
          onPress={() => sendMessage(input)}
          disabled={!input.trim() || loading}
        >
          <Text style={{ color: '#fff', fontSize: 20, fontWeight: '600' }}>→</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = '#0F0A1E', S2 = '#1A1030', P = '#7C3AED';
const styles = StyleSheet.create({
  container:    { flex: 1, backgroundColor: S },
  header:       { paddingTop: 52, paddingBottom: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 0.5, borderBottomColor: '#1F1440' },
  headerDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: P },
  headerName:   { color: '#EDE9FE', fontSize: 20, fontWeight: '600' },
  headerSub:    { color: '#6D28D9', fontSize: 12 },

  avatarSection:{ alignItems: 'center', paddingVertical: 18 },
  glowRing:     { position: 'absolute', width: 118, height: 118, borderRadius: 59, borderWidth: 2, top: 10 },
  avatarCircle: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center' },
  avatarEmoji:  { fontSize: 46 },
  waveBars:     { flexDirection: 'row', gap: 3, alignItems: 'center', marginTop: 8, height: 20 },
  waveBar:      { width: 3, borderRadius: 2 },
  stateLabel:   { marginTop: 8, fontSize: 13, fontWeight: '500' },

  msgList:      { flex: 1 },
  bubbleRow:    { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  rowLeft:      { justifyContent: 'flex-start' },
  rowRight:     { justifyContent: 'flex-end' },
  pixieDot:     { width: 7, height: 7, borderRadius: 3.5, backgroundColor: P, marginBottom: 8 },
  bubble:       { maxWidth: width * 0.72, borderRadius: 16, padding: 12 },
  bubblePixie:  { backgroundColor: '#1A1030', borderBottomLeftRadius: 4 },
  bubbleUser:   { backgroundColor: P, borderBottomRightRadius: 4 },
  bubbleText:   { fontSize: 15, lineHeight: 22 },
  textPixie:    { color: '#EDE9FE' },
  textUser:     { color: '#FFFFFF' },
  bubbleTime:   { fontSize: 10, color: '#6B7280', marginTop: 4, alignSelf: 'flex-end' },

  inputRow:     { flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 8, borderTopWidth: 0.5, borderTopColor: '#1F1440' },
  iconBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: S2, alignItems: 'center', justifyContent: 'center' },
  textInput:    { flex: 1, backgroundColor: S2, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#EDE9FE', fontSize: 15, maxHeight: 100 },
  sendBtn:      { width: 40, height: 40, borderRadius: 20, backgroundColor: P, alignItems: 'center', justifyContent: 'center' },
  sendDisabled: { backgroundColor: '#3B1F6E' },

  camControls:     { position: 'absolute', bottom: 60, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  camCancel:       { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  camCapture:      { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: '#fff' },
  camCaptureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#fff' },
  camHint:         { position: 'absolute', bottom: 18, width: '100%', textAlign: 'center', color: 'rgba(255,255,255,0.65)', fontSize: 13 },
});
