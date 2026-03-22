import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, KeyboardAvoidingView, Platform, Animated,
  Alert, ActivityIndicator, StatusBar, Dimensions
} from 'react-native';
import { Audio } from 'expo-av';
import { Camera } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import * as MediaLibrary from 'expo-media-library';
import io from 'socket.io-client';

const { width, height } = Dimensions.get('window');
const BACKEND_URL = 'https://YOUR-RAILWAY-URL.up.railway.app'; // ← update after deploy

// ─── Avatar Component ──────────────────────────────────────────────────────────
const PixieAvatar = ({ state }) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const mouthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, { toValue: -8, duration: 1500, useNativeDriver: true }),
        Animated.timing(bounceAnim, { toValue: 0, duration: 1500, useNativeDriver: true }),
      ])
    ).start();
  }, []);

  useEffect(() => {
    if (state === 'speaking') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(mouthAnim, { toValue: 1, duration: 150, useNativeDriver: false }),
          Animated.timing(mouthAnim, { toValue: 0, duration: 150, useNativeDriver: false }),
        ])
      ).start();
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 600, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0.3, duration: 600, useNativeDriver: false }),
        ])
      ).start();
    } else if (state === 'listening') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, { toValue: 1.05, duration: 500, useNativeDriver: true }),
          Animated.timing(scaleAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        ])
      ).start();
      Animated.timing(glowAnim, { toValue: 0.8, duration: 300, useNativeDriver: false }).start();
    } else if (state === 'thinking') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 0.6, duration: 800, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0.2, duration: 800, useNativeDriver: false }),
        ])
      ).start();
    } else {
      scaleAnim.setValue(1);
      Animated.timing(glowAnim, { toValue: 0.3, duration: 300, useNativeDriver: false }).start();
    }
  }, [state]);

  const avatarColor = {
    idle: '#7C3AED',
    listening: '#2563EB',
    thinking: '#D97706',
    speaking: '#059669',
    happy: '#DB2777',
    sad: '#6B7280',
  }[state] || '#7C3AED';

  const stateLabel = {
    idle: 'Pixie is here ✨',
    listening: 'Listening...',
    thinking: 'Thinking...',
    speaking: 'Speaking...',
    happy: 'Happy!',
    sad: 'Here for you',
  }[state] || '';

  return (
    <View style={styles.avatarSection}>
      <Animated.View style={[styles.glowRing, {
        borderColor: avatarColor,
        opacity: glowAnim,
        transform: [{ scale: scaleAnim }]
      }]} />
      <Animated.View style={[styles.avatarContainer, {
        transform: [{ translateY: bounceAnim }, { scale: scaleAnim }]
      }]}>
        <View style={[styles.avatarCircle, { backgroundColor: avatarColor }]}>
          <Text style={styles.avatarEmoji}>
            {state === 'idle' ? '😊' :
             state === 'listening' ? '👂' :
             state === 'thinking' ? '🤔' :
             state === 'speaking' ? '💬' :
             state === 'happy' ? '😄' : '🥺'}
          </Text>
        </View>
        {state === 'speaking' && (
          <View style={styles.waveContainer}>
            {[0, 1, 2, 3, 4].map(i => (
              <Animated.View key={i} style={[styles.waveBar, { backgroundColor: avatarColor }]} />
            ))}
          </View>
        )}
        {state === 'listening' && (
          <View style={styles.pulseRing}>
            <Animated.View style={[styles.pulseCircle, { borderColor: avatarColor, opacity: glowAnim }]} />
          </View>
        )}
      </Animated.View>
      <Text style={[styles.stateLabel, { color: avatarColor }]}>{stateLabel}</Text>
    </View>
  );
};

// ─── Message Bubble ────────────────────────────────────────────────────────────
const MessageBubble = ({ message }) => {
  const isPixie = message.role === 'assistant';
  return (
    <View style={[styles.bubbleRow, isPixie ? styles.pixieRow : styles.userRow]}>
      {isPixie && <View style={styles.pixieDot} />}
      <View style={[styles.bubble, isPixie ? styles.pixieBubble : styles.userBubble]}>
        <Text style={[styles.bubbleText, isPixie ? styles.pixieText : styles.userText]}>
          {message.content}
        </Text>
        <Text style={styles.bubbleTime}>
          {new Date(message.timestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );
};

// ─── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [avatarState, setAvatarState] = useState('idle');
  const [loading, setLoading] = useState(false);
  const [sound, setSound] = useState(null);
  const [cameraVisible, setCameraVisible] = useState(false);
  const [hasCameraPermission, setHasCameraPermission] = useState(null);
  const scrollRef = useRef(null);
  const cameraRef = useRef(null);
  const socketRef = useRef(null);

  // ─── Socket.io Setup ─────────────────────────────────────────────────────────
  useEffect(() => {
    socketRef.current = io(BACKEND_URL, { transports: ['websocket'] });
    socketRef.current.on('morning_briefing', ({ content, audio }) => {
      setMessages(prev => [...prev, { role: 'assistant', content, timestamp: new Date() }]);
      if (audio) playAudio(audio);
    });
    socketRef.current.on('new_message', (msg) => {
      // Real-time sync from other devices
    });
    return () => socketRef.current?.disconnect();
  }, []);

  // ─── Load History ────────────────────────────────────────────────────────────
  useEffect(() => {
    loadHistory();
    requestPermissions();
  }, []);

  const requestPermissions = async () => {
    const { status: cameraStatus } = await Camera.requestCameraPermissionsAsync();
    setHasCameraPermission(cameraStatus === 'granted');
    await Audio.requestPermissionsAsync();
    await MediaLibrary.requestPermissionsAsync();
  };

  const loadHistory = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/history`);
      const data = await res.json();
      setMessages(data.slice(-50));
    } catch (e) {
      // Start fresh if no history
      setMessages([{
        role: 'assistant',
        content: 'Heyy! Main hoon Pixie — tumhari personal AI. Kaise ho aaj? 😊',
        timestamp: new Date()
      }]);
    }
  };

  // ─── Play Audio ──────────────────────────────────────────────────────────────
  const playAudio = async (base64Audio) => {
    try {
      if (sound) { await sound.unloadAsync(); }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
      const uri = FileSystem.cacheDirectory + 'pixie_voice.mp3';
      await FileSystem.writeAsStringAsync(uri, base64Audio, { encoding: FileSystem.EncodingType.Base64 });
      const { sound: newSound } = await Audio.Sound.createAsync({ uri });
      setSound(newSound);
      setAvatarState('speaking');
      await newSound.playAsync();
      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) setAvatarState('idle');
      });
    } catch (e) {
      console.error('Audio error:', e);
      setAvatarState('idle');
    }
  };

  // ─── Send Message ─────────────────────────────────────────────────────────────
  const sendMessage = useCallback(async (text, imageBase64 = null, imageType = null) => {
    if (!text.trim() && !imageBase64) return;
    const userMsg = { role: 'user', content: text || 'What do you see?', timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setAvatarState('thinking');

    try {
      const body = { message: text };
      if (imageBase64) { body.imageBase64 = imageBase64; body.imageType = imageType; }

      const res = await fetch(`${BACKEND_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await res.json();

      const pixieMsg = { role: 'assistant', content: data.reply, timestamp: new Date() };
      setMessages(prev => [...prev, pixieMsg]);

      if (data.audio) {
        await playAudio(data.audio);
      } else {
        setAvatarState(data.mood === 'happy' ? 'happy' : data.mood === 'sad' ? 'sad' : 'idle');
        setTimeout(() => setAvatarState('idle'), 2000);
      }
    } catch (e) {
      Alert.alert('Oops!', 'Could not reach Pixie. Check your internet.');
      setAvatarState('idle');
    } finally {
      setLoading(false);
      scrollRef.current?.scrollToEnd({ animated: true });
    }
  }, [sound]);

  // ─── Camera Capture ───────────────────────────────────────────────────────────
  const captureAndSend = async () => {
    if (!cameraRef.current) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.5 });
      setCameraVisible(false);
      await sendMessage('What do you see in this image? Tell me naturally.', photo.base64, 'image/jpeg');
    } catch (e) {
      Alert.alert('Camera error', e.message);
    }
  };

  // ─── Pick from Gallery ────────────────────────────────────────────────────────
  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true, quality: 0.5
    });
    if (!result.canceled && result.assets[0]) {
      await sendMessage('What do you see in this photo?', result.assets[0].base64, 'image/jpeg');
    }
  };

  // ─── Camera View ──────────────────────────────────────────────────────────────
  if (cameraVisible) {
    return (
      <View style={styles.cameraContainer}>
        <Camera style={StyleSheet.absoluteFillObject} ref={cameraRef} />
        <View style={styles.cameraControls}>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setCameraVisible(false)}>
            <Text style={styles.cancelBtnText}>✕</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.captureBtn} onPress={captureAndSend}>
            <View style={styles.captureInner} />
          </TouchableOpacity>
          <View style={{ width: 48 }} />
        </View>
        <Text style={styles.cameraHint}>Show Pixie anything — she'll tell you about it</Text>
      </View>
    );
  }

  // ─── Main UI ──────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <StatusBar barStyle="light-content" backgroundColor="#0F0A1E" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerDot} />
        <Text style={styles.headerTitle}>Pixie</Text>
        <Text style={styles.headerSub}>your personal AI</Text>
      </View>

      {/* Avatar */}
      <PixieAvatar state={avatarState} />

      {/* Messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messageList}
        contentContainerStyle={styles.messageContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((msg, i) => <MessageBubble key={i} message={msg} />)}
        {loading && (
          <View style={styles.typingIndicator}>
            <ActivityIndicator size="small" color="#7C3AED" />
            <Text style={styles.typingText}>Pixie is thinking...</Text>
          </View>
        )}
      </ScrollView>

      {/* Input */}
      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setCameraVisible(true)}>
          <Text style={styles.iconBtnText}>📷</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={pickImage}>
          <Text style={styles.iconBtnText}>🖼</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.textInput}
          value={input}
          onChangeText={setInput}
          placeholder="Talk to Pixie..."
          placeholderTextColor="#6B7280"
          multiline
          maxLength={500}
          onFocus={() => setAvatarState('listening')}
          onBlur={() => !loading && setAvatarState('idle')}
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() && !loading) && styles.sendBtnDisabled]}
          onPress={() => sendMessage(input)}
          disabled={loading || !input.trim()}
        >
          <Text style={styles.sendBtnText}>→</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0A1E' },
  header: { paddingTop: 54, paddingBottom: 12, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 0.5, borderBottomColor: '#1F1440' },
  headerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#7C3AED' },
  headerTitle: { color: '#EDE9FE', fontSize: 20, fontWeight: '600' },
  headerSub: { color: '#6D28D9', fontSize: 13, marginLeft: 4 },

  avatarSection: { alignItems: 'center', paddingVertical: 20, position: 'relative' },
  avatarContainer: { alignItems: 'center' },
  avatarCircle: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', elevation: 8 },
  avatarEmoji: { fontSize: 48 },
  glowRing: { position: 'absolute', width: 120, height: 120, borderRadius: 60, borderWidth: 2, top: 10 },
  stateLabel: { marginTop: 8, fontSize: 13, fontWeight: '500' },
  waveContainer: { flexDirection: 'row', gap: 3, marginTop: 8, alignItems: 'center', height: 20 },
  waveBar: { width: 3, height: 14, borderRadius: 2 },
  pulseRing: { position: 'absolute', bottom: -10 },
  pulseCircle: { width: 110, height: 110, borderRadius: 55, borderWidth: 1.5 },

  messageList: { flex: 1 },
  messageContent: { padding: 16, gap: 10 },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  pixieRow: { justifyContent: 'flex-start' },
  userRow: { justifyContent: 'flex-end' },
  pixieDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#7C3AED', marginBottom: 8 },
  bubble: { maxWidth: width * 0.72, borderRadius: 16, padding: 12 },
  pixieBubble: { backgroundColor: '#1F1440', borderBottomLeftRadius: 4 },
  userBubble: { backgroundColor: '#7C3AED', borderBottomRightRadius: 4 },
  bubbleText: { fontSize: 15, lineHeight: 22 },
  pixieText: { color: '#EDE9FE' },
  userText: { color: '#FFFFFF' },
  bubbleTime: { fontSize: 10, color: '#6B7280', marginTop: 4, alignSelf: 'flex-end' },

  typingIndicator: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 14 },
  typingText: { color: '#6B7280', fontSize: 13 },

  inputRow: { flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 8, borderTopWidth: 0.5, borderTopColor: '#1F1440', backgroundColor: '#0F0A1E' },
  iconBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#1F1440', alignItems: 'center', justifyContent: 'center' },
  iconBtnText: { fontSize: 18 },
  textInput: { flex: 1, backgroundColor: '#1F1440', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, color: '#EDE9FE', fontSize: 15, maxHeight: 100 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#7C3AED', alignItems: 'center', justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: '#3B1F6E' },
  sendBtnText: { color: 'white', fontSize: 18, fontWeight: '600' },

  cameraContainer: { flex: 1, backgroundColor: 'black' },
  cameraControls: { position: 'absolute', bottom: 60, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center' },
  cancelBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { color: 'white', fontSize: 20 },
  captureBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255,255,255,0.3)', alignItems: 'center', justifyContent: 'center', borderWidth: 3, borderColor: 'white' },
  captureInner: { width: 56, height: 56, borderRadius: 28, backgroundColor: 'white' },
  cameraHint: { position: 'absolute', bottom: 20, width: '100%', textAlign: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 13 },
});
