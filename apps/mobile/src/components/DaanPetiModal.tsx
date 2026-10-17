import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  TouchableWithoutFeedback,
} from 'react-native';
import { X, Sparkles, Globe } from 'lucide-react-native';
import { darkTheme } from '../theme/colors';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const daanPetiBoxImage = require('../../assets/images/daan-peti-box.png');
const qrCodeImage = require('../../assets/images/daan-peti-qr.png');

interface DaanPetiModalProps {
  visible: boolean;
  onClose: () => void;
}

type LanguageKey = 'hindi' | 'sanskrit' | 'english' | 'telugu' | 'all';

interface LanguageContent {
  id: LanguageKey;
  label: string;
  nativeTitle: string;
  message: string;
  quote?: string;
}

const MESSAGES: LanguageContent[] = [
  {
    id: 'hindi',
    label: 'हिन्दी',
    nativeTitle: 'पवित्र दान पेटी • हिन्दी',
    message:
      'समाज के कल्याण और उत्थान के लिए, आप अपनी सामर्थ्य और इच्छानुसार दान पेटी में अपना पावन योगदान दे सकते हैं। आपका यह निःस्वार्थ सहयोग समाज के मंगल का आधार है।',
    quote: 'दानं परमो धर्मः — निस्वार्थ भाव से दिया गया दान ही सर्वश्रेष्ठ है।',
  },
  {
    id: 'sanskrit',
    label: 'संस्कृतम्',
    nativeTitle: 'पवित्रा दानपेटिका • संस्कृतम्',
    message:
      'लोककल्याणाय समाजस्य समुत्कर्षाय च, भवन्तः स्वसामर्थ्यानुरूपम् इच्छानुसारं च अस्यां दानपेटिकायां पावनं योगदानं कुर्वन्तु। दानेन समाजस्य श्रेयः भवति।',
    quote: 'दातव्यमिति यद्दानं दीयतेऽनुपकारिणे। देशे काले च पात्रे च तद्दानं सात्त्विकं स्मृतम्॥ (गीता १७.२०)',
  },
  {
    id: 'english',
    label: 'English',
    nativeTitle: 'Sacred Daan Peti • English',
    message:
      'For the welfare and betterment of society, you are invited to contribute your desired and able amount into the Daan Peti. Every selfless offering nurtures the common good.',
    quote: 'Acts of selfless giving bring purity to the mind and uplift society.',
  },
  {
    id: 'telugu',
    label: 'తెలుగు',
    nativeTitle: 'పవిత్ర దానపేటీ • తెలుగు',
    message:
      'సమాజ శ్రేయస్సు మరియు ఉన్నతి కొరకు, మీ స్తోమత మరియు ఇష్టానుసారంగా ఈ దానపేటీలో మీ పవిత్రమైన విరాళాన్ని సమర్పించండి. మీ నిస్వార్థ సహకారం సమాజ క్షేమానికి మూలము.',
    quote: 'దానము చేత సర్వ శ్రేయస్సులు చేకూరును — సమాజ హితమే పరమ ధర్మం.',
  },
];

export const DaanPetiModal: React.FC<DaanPetiModalProps> = ({ visible, onClose }) => {
  const [selectedLang, setSelectedLang] = useState<LanguageKey>('hindi');

  if (!visible) return null;

  const displayedMessages =
    selectedLang === 'all'
      ? MESSAGES
      : MESSAGES.filter((m) => m.id === selectedLang);

  return (
    <View style={styles.fullscreenOverlay} pointerEvents="box-none">
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>

      <View style={styles.modalCard}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleRow}>
            <View style={styles.iconCircle}>
              <Image source={daanPetiBoxImage} style={styles.headerDaanPetiLogo} resizeMode="cover" />
            </View>
            <View>
              <Text style={styles.title}>दान पेटी • Daan Peti</Text>
              <Text style={styles.subtitle}>Sacred Offering for Betterment of Society</Text>
            </View>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <X size={20} color={darkTheme.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Daan Peti Box & QR Presentation */}
          <View style={styles.visualSection}>
            <View style={styles.boxBanner}>
              <Image source={daanPetiBoxImage} style={styles.boxImage} resizeMode="contain" />
              <View style={styles.boxTag}>
                <Text style={styles.boxTagText}>दान पेटी • समाज कल्याण</Text>
              </View>
            </View>

            <View style={styles.qrCard}>
              <Image source={qrCodeImage} style={styles.qrImage} resizeMode="contain" />
            </View>
            <Text style={styles.scanNotice}>
              Scan PhonePe QR Code with any UPI App
            </Text>
          </View>

          {/* Language Selector Bar (Ordered: 1. Hindi, 2. Sanskrit, 3. English, 4. Telugu) */}
          <View style={styles.langSelectorWrap}>
            <View style={styles.langSelectorHeader}>
              <Globe size={14} color={darkTheme.primary} style={{ marginRight: 6 }} />
              <Text style={styles.langSelectorTitle}>Select Language / भाषा चुनें</Text>
            </View>
            <View style={styles.langTabsRow}>
              {MESSAGES.map((lang, idx) => {
                const isSelected = selectedLang === lang.id;
                return (
                  <TouchableOpacity
                    key={lang.id}
                    style={[styles.langTab, isSelected && styles.langTabActive]}
                    onPress={() => setSelectedLang(lang.id)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.langTabText, isSelected && styles.langTabTextActive]}>
                      {idx + 1}. {lang.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[styles.langTab, selectedLang === 'all' && styles.langTabActive]}
                onPress={() => setSelectedLang('all')}
                activeOpacity={0.7}
              >
                <Text
                  style={[styles.langTabText, selectedLang === 'all' && styles.langTabTextActive]}
                >
                  All (सभी)
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Messages in Ordered Sequence */}
          <View style={styles.messagesContainer}>
            {displayedMessages.map((item) => (
              <View key={item.id} style={styles.messageCard}>
                <View style={styles.msgHeader}>
                  <Sparkles size={14} color={darkTheme.primary} />
                  <Text style={styles.msgTitle}>{item.nativeTitle}</Text>
                </View>
                <Text style={styles.msgBody}>{item.message}</Text>
                {item.quote && <Text style={styles.msgQuote}>"{item.quote}"</Text>}
              </View>
            ))}
          </View>

          {/* Gita Inspiration Footer */}
          <View style={styles.footerGita}>
            <Text style={styles.gitaSanskrit}>
              दातव्यमिति यद्दानं दीयतेऽनुपकारिणे | देशे काले च पात्रे च तद्दानं सात्त्विकं स्मृतम् ||
            </Text>
            <Text style={styles.gitaMeaning}>
              Bhagavad Gita 17.20: Giving with a pure heart for societal welfare without
              expecting reward is the highest, most sattvic virtue.
            </Text>
          </View>
        </ScrollView>

        {/* Close button at bottom */}
        <View style={styles.bottomBar}>
          <TouchableOpacity style={styles.doneBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.doneBtnText}>Close / बन्द करें</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  fullscreenOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999999,
    elevation: 999999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.82)',
  },
  modalCard: {
    width: Math.min(SCREEN_WIDTH * 0.94, 430),
    height: Math.min(SCREEN_HEIGHT * 0.86, 720),
    backgroundColor: '#0F1523',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: 'rgba(212, 175, 55, 0.5)',
    overflow: 'hidden',
    shadowColor: darkTheme.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 20,
    elevation: 30,
    zIndex: 1000000,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#1E293B',
    backgroundColor: '#121A2E',
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(212, 175, 55, 0.15)',
    borderWidth: 1.5,
    borderColor: darkTheme.primary,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerDaanPetiLogo: {
    width: 42,
    height: 42,
  },
  title: {
    color: '#F8FAFC',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  subtitle: {
    color: darkTheme.primary,
    fontSize: 10.5,
    fontWeight: '500',
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: 14,
    paddingBottom: 20,
  },
  visualSection: {
    alignItems: 'center',
    marginBottom: 14,
  },
  boxBanner: {
    alignItems: 'center',
    marginBottom: 12,
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.25)',
  },
  boxImage: {
    width: 140,
    height: 120,
  },
  boxTag: {
    marginTop: 4,
    backgroundColor: 'rgba(212, 175, 55, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkTheme.primary,
  },
  boxTagText: {
    color: darkTheme.primary,
    fontSize: 11,
    fontWeight: '700',
  },
  qrCard: {
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: darkTheme.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  qrImage: {
    width: Math.min(SCREEN_WIDTH * 0.58, 210),
    height: Math.min(SCREEN_WIDTH * 0.58, 210),
  },
  scanNotice: {
    color: darkTheme.textSecondary,
    fontSize: 11,
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '600',
  },
  langSelectorWrap: {
    backgroundColor: '#141D30',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#232D4B',
    marginBottom: 12,
  },
  langSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingHorizontal: 2,
  },
  langSelectorTitle: {
    color: darkTheme.textSecondary,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.3,
  },
  langTabsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  langTab: {
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 8,
    backgroundColor: '#1E293B',
    borderWidth: 1,
    borderColor: '#334155',
  },
  langTabActive: {
    backgroundColor: darkTheme.primary,
    borderColor: darkTheme.primary,
  },
  langTabText: {
    color: darkTheme.textSecondary,
    fontSize: 11,
    fontWeight: '600',
  },
  langTabTextActive: {
    color: '#0B0F19',
    fontWeight: '700',
  },
  messagesContainer: {
    gap: 10,
  },
  messageCard: {
    backgroundColor: '#141D30',
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 3.5,
    borderLeftColor: darkTheme.primary,
    borderWidth: 1,
    borderColor: '#232D4B',
  },
  msgHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  msgTitle: {
    color: darkTheme.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  msgBody: {
    color: '#F1F5F9',
    fontSize: 12.5,
    lineHeight: 18,
    fontWeight: '400',
  },
  msgQuote: {
    color: '#CBD5E1',
    fontSize: 11,
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 15,
    paddingLeft: 8,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(212, 175, 55, 0.4)',
  },
  footerGita: {
    marginTop: 14,
    padding: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(212, 175, 55, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(212, 175, 55, 0.25)',
  },
  gitaSanskrit: {
    color: darkTheme.primaryLight,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 16,
  },
  gitaMeaning: {
    color: darkTheme.textSecondary,
    fontSize: 10.5,
    textAlign: 'center',
    marginTop: 5,
    lineHeight: 14,
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#1E293B',
    backgroundColor: '#121A2E',
  },
  doneBtn: {
    backgroundColor: '#1E293B',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  doneBtnText: {
    color: '#F8FAFC',
    fontSize: 12.5,
    fontWeight: '600',
  },
});
