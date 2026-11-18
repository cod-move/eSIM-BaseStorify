/**
 * What the check-in bot says. Chinese for a Telegram user whose app is set to
 * Chinese (simplified or traditional), English for everyone else.
 */

export type BotLanguage = "zh" | "en";

export function botLanguage(code: string | null | undefined): BotLanguage {
  return code?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

type Words = {
  help: (bot: string, site: string) => string;
  checkedIn: (name: string, amount: string, balance: string) => string;
  already: (name: string, balance: string) => string;
  capReached: string;
  notLinked: (name: string, bot: string) => string;
  disabled: string;
  groupOnly: string;
  /** After linking: go to the group and send 签到; `groupLink` when the admin set one. */
  linked: (email: string, groupLink: string | null) => string;
  linkExpired: string;
  bindUsage: string;
  bindPrivate: string;
  codeSent: string;
  codeTooMany: string;
  codeWrong: string;
  codeExpired: string;
  balance: (amount: string, checkins: number, site: string) => string;
  balanceNone: string;
  chatId: (id: string) => string;
  emailSubject: string;
  emailBody: (code: string) => string;
};

const zh: Words = {
  help: (bot, site) =>
    `欢迎！每天在群里发 /checkin 或「签到」可随机领取流量，攒够后在网站兑换 eSIM。\n\n` +
    `先绑定账号（二选一）：\n` +
    `1. 登录网站 ${site}/account/esims/rewards ，点「绑定 Telegram」\n` +
    `2. 在这里发 /bind 你的注册邮箱 ，再把邮件里的 6 位验证码发给我\n\n` +
    `/balance 查看已攒流量`,
  checkedIn: (name, amount, balance) => `${name} 签到成功，获得 ${amount}！累计 ${balance}。`,
  already: (name, balance) => `${name} 今天已经签到过了，明天再来。累计 ${balance}。`,
  capReached: "今天的签到流量已经送完了，明天早点来。",
  notLinked: (name, bot) => `${name} 还没有绑定账号。请私聊 @${bot} 发 /start 按提示绑定。`,
  disabled: "签到活动暂未开放。",
  groupOnly: "签到要在活动群里发哦。",
  linked: (email, groupLink) =>
    `绑定成功：${email}\n\n现在去群里回复「签到」或 /checkin，每天一次，随机领取流量。` + (groupLink ? `\n\n👉 进群签到：${groupLink}` : ""),
  linkExpired: "这个绑定链接已失效，请回到网站重新点「绑定 Telegram」。",
  bindUsage: "请发：/bind 你的注册邮箱\n例如：/bind name@example.com",
  bindPrivate: "为保护隐私，请私聊我绑定，不要在群里发邮箱。",
  codeSent: "如果这个邮箱已在本站注册，我们已经发送了 6 位验证码（10 分钟内有效），请直接把验证码发给我。",
  codeTooMany: "验证码发得太频繁了，请一小时后再试。",
  codeWrong: "验证码不对，请再检查一下。",
  codeExpired: "验证码已失效或尝试次数过多，请重新发 /bind 你的邮箱。",
  balance: (amount, checkins, site) => `已攒流量：${amount}（共签到 ${checkins} 次）\n兑换 eSIM：${site}/account/esims/rewards`,
  balanceNone: "你还没有绑定账号，发 /start 查看绑定方法。",
  chatId: (id) => `本群 ID：${id}`,
  emailSubject: "你的 Telegram 绑定验证码",
  emailBody: (code) => `你的验证码是 <b style="font-size:20px;letter-spacing:4px">${code}</b>，10 分钟内有效。把它发给我们的 Telegram 机器人即可完成绑定。如果不是你本人操作，请忽略这封邮件。`,
};

const en: Words = {
  help: (bot, site) =>
    `Welcome! Send /checkin in the group once a day for free data, then exchange it for an eSIM on the website.\n\n` +
    `First link your account (either way):\n` +
    `1. Sign in at ${site}/account/esims/rewards and tap "Link Telegram"\n` +
    `2. Send /bind your@email here, then send me the 6-digit code from the email\n\n` +
    `/balance shows the data you have saved`,
  checkedIn: (name, amount, balance) => `${name} checked in and got ${amount}! Total ${balance}.`,
  already: (name, balance) => `${name}, you already checked in today. Come back tomorrow. Total ${balance}.`,
  capReached: "Today's check-in data has all been given out. Come back earlier tomorrow.",
  notLinked: (name, bot) => `${name}, your account is not linked yet. Message @${bot} and send /start to link it.`,
  disabled: "Check-in rewards are not open at the moment.",
  groupOnly: "Please check in in the rewards group.",
  linked: (email, groupLink) =>
    `Linked to ${email}.\n\nNow reply /checkin (or 签到) in the group once a day for free data.` + (groupLink ? `\n\n👉 Join the group to check in: ${groupLink}` : ""),
  linkExpired: "This link has expired. Go back to the website and tap \"Link Telegram\" again.",
  bindUsage: "Send: /bind your@email\nFor example: /bind name@example.com",
  bindPrivate: "To keep your email private, message me directly to link your account.",
  codeSent: "If this email has an account with us, we have sent it a 6-digit code (valid for 10 minutes). Send the code to me here.",
  codeTooMany: "Too many codes asked for. Please try again in an hour.",
  codeWrong: "That code is not right. Please check it.",
  codeExpired: "The code has expired or was tried too often. Send /bind your@email again.",
  balance: (amount, checkins, site) => `Data saved: ${amount} (${checkins} check-ins)\nExchange it for an eSIM: ${site}/account/esims/rewards`,
  balanceNone: "Your account is not linked yet. Send /start to see how.",
  chatId: (id) => `This chat's ID: ${id}`,
  emailSubject: "Your Telegram link code",
  emailBody: (code) => `Your code is <b style="font-size:20px;letter-spacing:4px">${code}</b>. It is valid for 10 minutes. Send it to our Telegram bot to link your account. If you did not ask for this, ignore this email.`,
};

export function words(language: BotLanguage): Words {
  return language === "zh" ? zh : en;
}
