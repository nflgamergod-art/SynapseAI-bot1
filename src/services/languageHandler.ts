export type SupportedLanguage = 'en' | 'es' | 'fr' | 'de' | 'it' | 'pt' | 'nl' | 'ru' | 'ja' | 'ko' | 'zh';

// Dynamic import for franc (ES Module)
let francModule: any = null;
async function loadFranc() {
  if (!francModule) {
    francModule = await import('franc');
  }
  return francModule.franc || francModule.default;
}

export class LanguageHandler {
  private static readonly SUPPORTED_LANGUAGES: Set<SupportedLanguage> = new Set([
    'en', // English
    'es', // Spanish
    'fr', // French
    'de', // German
    'it', // Italian
    'pt', // Portuguese
    'nl', // Dutch
    'ru', // Russian
    'ja', // Japanese
    'ko', // Korean
    'zh', // Chinese
  ]);

  private static readonly REPEAT_RESPONSES: Record<SupportedLanguage, string[]> = {
    en: [
      "I just answered that question, {username}! Scroll up a bit. 😊",
      "{username}, we just talked about this! Check above. 🔍",
      "Hmm, déjà vu? We were just discussing this, {username}! 🤔"
    ],
    es: [
      "¡{username}, acabo de responder esa pregunta! Mira arriba. 😊",
      "¡{username}, acabamos de hablar de esto! Revisa arriba. 🔍",
      "¿Déjà vu? ¡{username}, acabamos de discutir esto! 🤔"
    ],
    fr: [
      "Je viens de répondre à cette question, {username} ! Regardez un peu plus haut. 😊",
      "{username}, on vient d'en parler ! Vérifiez au-dessus. 🔍",
      "Tiens, un déjà-vu ? On en discutait justement, {username} ! 🤔"
    ],
    de: [
      "{username}, ich habe diese Frage gerade beantwortet! Scroll ein bisschen nach oben. 😊",
      "{username}, wir haben gerade darüber gesprochen! Schau nach oben. 🔍",
      "Déjà-vu? {username}, wir haben das gerade besprochen! 🤔"
    ],
    it: [
      "{username}, ho appena risposto a questa domanda! Scorri un po' su. 😊",
      "{username}, ne abbiamo appena parlato! Controlla sopra. 🔍",
      "Déjà vu? {username}, ne stavamo appena parlando! 🤔"
    ],
    pt: [
      "{username}, acabei de responder essa pergunta! Role um pouco para cima. 😊",
      "{username}, acabamos de falar sobre isso! Verifique acima. 🔍",
      "Déjà vu? {username}, acabamos de discutir isso! 🤔"
    ],
    nl: [
      "{username}, ik heb deze vraag net beantwoord! Scroll even omhoog. 😊",
      "{username}, we hebben het hier net over gehad! Kijk hierboven. 🔍",
      "Déjà vu? {username}, we hebben dit net besproken! 🤔"
    ],
    ru: [
      "{username}, я только что ответил на этот вопрос! Прокрутите немного вверх. 😊",
      "{username}, мы только что об этом говорили! Проверьте выше. 🔍",
      "Дежавю? {username}, мы только что это обсуждали! 🤔"
    ],
    ja: [
      "{username}さん、その質問にさっき答えましたよ！上をご確認ください。😊",
      "{username}さん、今話したばかりですよ！上を見てください。🔍",
      "デジャヴ？{username}さん、今話していたところです！🤔"
    ],
    ko: [
      "{username}님, 방금 그 질문에 답변했어요! 위로 스크롤해보세요. 😊",
      "{username}님, 방금 이야기했잖아요! 위를 확인해보세요. 🔍",
      "데자뷰인가요? {username}님, 방금 이야기했던 내용이에요! 🤔"
    ],
    zh: [
      "{username}，我刚刚回答了这个问题！向上滚动看看。😊",
      "{username}，我们刚刚讨论过这个！看看上面。🔍",
      "似曾相识？{username}，我们刚刚讨论过这个！🤔"
    ]
  };

  private static readonly DIFFERENT_USER_RESPONSES: Record<SupportedLanguage, string[]> = {
    en: [
      "Actually, {lastAskedBy} just asked me that! Let me tell you what I told them...",
      "Oh, {lastAskedBy} was curious about this too! Here's what I know..."
    ],
    es: [
      "¡De hecho, {lastAskedBy} acaba de preguntarme eso! Déjame decirte lo que les dije...",
      "¡Oh, {lastAskedBy} también tenía curiosidad por esto! Esto es lo que sé..."
    ],
    fr: [
      "En fait, {lastAskedBy} vient de me poser cette question ! Je vais te dire ce que je leur ai dit...",
      "Oh, {lastAskedBy} était aussi curieux à ce sujet ! Voici ce que je sais..."
    ],
    de: [
      "Tatsächlich hat {lastAskedBy} mich das gerade gefragt! Ich sage dir, was ich ihnen gesagt habe...",
      "Oh, {lastAskedBy} war auch daran interessiert! Hier ist, was ich weiß..."
    ],
    it: [
      "In realtà, {lastAskedBy} me l'ha appena chiesto! Ti dico quello che ho detto...",
      "Oh, anche {lastAskedBy} era curioso di questo! Ecco quello che so..."
    ],
    pt: [
      "Na verdade, {lastAskedBy} acabou de me perguntar isso! Deixa eu te dizer o que eu disse...",
      "Ah, {lastAskedBy} também estava curioso sobre isso! Aqui está o que eu sei..."
    ],
    nl: [
      "Eigenlijk heeft {lastAskedBy} me dat net gevraagd! Laat me je vertellen wat ik hen vertelde...",
      "Oh, {lastAskedBy} was ook nieuwsgierig hiernaar! Dit is wat ik weet..."
    ],
    ru: [
      "Вообще-то, {lastAskedBy} только что спросил меня об этом! Позвольте рассказать, что я ответил...",
      "О, {lastAskedBy} тоже было интересно! Вот что я знаю..."
    ],
    ja: [
      "実は、{lastAskedBy}さんがたった今それを聞きましたよ！お答えした内容をお伝えしましょう...",
      "あ、{lastAskedBy}さんも気になっていたんですね！私の知っていることをお話しします..."
    ],
    ko: [
      "사실, {lastAskedBy}님이 방금 그걸 물어보셨어요! 제가 답변한 내용을 알려드릴게요...",
      "아, {lastAskedBy}님도 궁금해하셨네요! 제가 아는 것을 알려드리겠습니다..."
    ],
    zh: [
      "实际上，{lastAskedBy}刚刚问过我这个！让我告诉你我是怎么回答的...",
      "哦，{lastAskedBy}也对此很好奇！这是我所知道的..."
    ]
  };

  public static async detectLanguage(text: string): Promise<SupportedLanguage> {
    // Remove mentions, URLs, and emojis for better detection
    const cleanText = text
      .replace(/<@!?\d+>/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}]/gu, '');

    // franc returns ISO 639-3 codes (e.g. 'eng', 'spa', 'fra'). Map common ones to our 2-letter set.
    const franc = await loadFranc();
    const francCode = franc(cleanText) as string; // e.g. 'eng', 'spa', 'und'

    const map: Record<string, SupportedLanguage> = {
      eng: 'en',
      spa: 'es',
      por: 'pt',
      fra: 'fr',
      fre: 'fr',
      deu: 'de',
      ger: 'de',
      ita: 'it',
      nld: 'nl',
      dut: 'nl',
      rus: 'ru',
      jpn: 'ja',
      kor: 'ko',
      cmn: 'zh',
      zho: 'zh',
      // add more mappings as needed
    };

    const detected = francCode && francCode !== 'und' ? (map[francCode] as SupportedLanguage | undefined) : undefined;
    if (detected && this.SUPPORTED_LANGUAGES.has(detected)) return detected;

    return 'en';
  }

  public static getRepeatResponse(language: SupportedLanguage, username: string, timesAsked: number): string {
    const responses = this.REPEAT_RESPONSES[language] || this.REPEAT_RESPONSES.en;
    let response = responses[Math.floor(Math.random() * responses.length)];

    if (timesAsked > 3) {
      // Use language-specific format for multiple asks
      switch (language) {
        case 'es':
          return `${username}, esta es la ${timesAsked}ª vez que preguntas esto. ¿Me estás poniendo a prueba? 😄`;
        case 'fr':
          return `${username}, c'est la ${timesAsked}ème fois que vous posez cette question. Vous me testez ? 😄`;
        case 'de':
          return `${username}, das ist das ${timesAsked}. Mal, dass du das fragst. Testest du mich? 😄`;
        case 'it':
          return `${username}, questa è la ${timesAsked}ª volta che lo chiedi. Mi stai mettendo alla prova? 😄`;
        case 'pt':
          return `${username}, esta é a ${timesAsked}ª vez que você pergunta isso. Está me testando? 😄`;
        case 'nl':
          return `${username}, dit is de ${timesAsked}e keer dat je dit vraagt. Test je me? 😄`;
        case 'ru':
          return `${username}, это ${timesAsked}-й раз, когда вы это спрашиваете. Вы меня проверяете? 😄`;
        case 'ja':
          return `${username}さん、それを聞くのは${timesAsked}回目ですよ。テストしているんですか？😄`;
        case 'ko':
          return `${username}님, 이걸 ${timesAsked}번째 물어보시네요. 저를 테스트하시는 건가요? 😄`;
        case 'zh':
          return `${username}，这是你第${timesAsked}次问这个问题了。你在测试我吗？😄`;
        default:
          return `${username}, this is the ${timesAsked}th time you've asked this. Are you testing me? 😄`;
      }
    }

    return response.replace('{username}', username);
  }

  public static getDifferentUserRepeatResponse(language: SupportedLanguage, lastAskedBy: string): string {
    const responses = this.DIFFERENT_USER_RESPONSES[language] || this.DIFFERENT_USER_RESPONSES.en;
    const response = responses[Math.floor(Math.random() * responses.length)];
    return response.replace('{lastAskedBy}', lastAskedBy);
  }
}