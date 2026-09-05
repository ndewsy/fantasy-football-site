"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import NavBar from "@/app/components/NavBar";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import CreatorAvatar from "@/app/components/CreatorAvatar";
import PlayerHeadshot from "@/app/components/PlayerHeadshot";
import AuctionRankingsEditor from "@/app/components/AuctionRankingsEditor";
import WaiverWireEditor from "@/app/components/WaiverWireEditor";
import Cropper from "react-easy-crop";
import { DST_FORMAT, KICKER_FORMAT } from "@/lib/dstKickerFormats";

const FORMATS = ["Dynasty SF", "Dynasty 1QB", "Redraft 1QB", "Redraft SF", DST_FORMAT, KICKER_FORMAT];
const DEFAULT_TIERS = [1, 13, 25, 37, 49, 61, 73, 85, 97, 109, 121, 151];

function getTierNumber(rank, tiers) {
  for (let i = tiers.length - 1; i >= 0; i--) {
    if (rank >= tiers[i]) return i + 1;
  }
  return 1;
}
const TAGS = ["Buy Now", "Sell Now", "Analysis", "Rankings"];
const CREATOR_IDS = ["rookierager", "ffhuddle"];
const MAX_POST_FILES = 10;
const MAX_POST_FILE_BYTES = 20 * 1024 * 1024;

const posColors = {
  WR: "bg-blue-100 text-blue-700",
  RB: "bg-green-100 text-green-700",
  QB: "bg-red-100 text-red-700",
  TE: "bg-amber-100 text-amber-700",
  DST: "bg-purple-100 text-purple-700",
  K: "bg-teal-100 text-teal-700",
};

// Converts a player array from either integer IDs (new format) or objects (legacy)
// into player objects using the provided id→player map.
function expandIds(arr, byId) {
  if (!arr?.length) return [];
  if (typeof arr[0] === "number") return arr.map(id => byId[id]).filter(Boolean);
  return arr; // already objects (legacy format)
}

export default function DashboardPage() {
  const router = useRouter();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("rankings");

  // Rankings state
  const [activeFormat, setActiveFormat] = useState(FORMATS[0]);
  const [rankings, setRankings] = useState({});
  const [rankingsSaving, setRankingsSaving] = useState(false);
  const [rankingsSaved, setRankingsSaved] = useState(false);
  const [rankingsSaveError, setRankingsSaveError] = useState(false);
  const dragIndex = useRef(null);
  const pendingRankings = useRef(null);
  const rankEditTimerRef = useRef(null);
  const draggedSeparatorTier = useRef(null);
  const tierDropTarget = useRef(null);
  const lastEditedPlayerRef = useRef(null);
  const [tierDropRank, setTierDropRank] = useState(null);
  const [tiersByFormat, setTiersByFormat] = useState({});
  const [rankingsSearch, setRankingsSearch] = useState("");
  const [showAddPlayer, setShowAddPlayer] = useState(false);
  const [addPlayerSearch, setAddPlayerSearch] = useState("");
  const [addPlayerResults, setAddPlayerResults] = useState([]);
  const [confirmRemovePlayer, setConfirmRemovePlayer] = useState(null);
  const [showUnranked, setShowUnranked] = useState(false);
  const [selectedPlayers, setSelectedPlayers] = useState(new Set());
  const [lastClickedPlayer, setLastClickedPlayer] = useState(null);
  const [bulkMoveConfirm, setBulkMoveConfirm] = useState(false);

  // Add tier modal state
  const [showAddTierModal, setShowAddTierModal] = useState(false);
  const [addTierRank, setAddTierRank] = useState("");
  const [addTierError, setAddTierError] = useState("");

  // Excel import state
  const [showImport, setShowImport] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importError, setImportError] = useState("");
  const [importLoading, setImportLoading] = useState(false);
  const [importSkipped, setImportSkipped] = useState([]);
  const importFileRef = useRef(null);

  // Posts state
  const [posts, setPosts] = useState([]);
  const [postTitle, setPostTitle] = useState("");
  const [postTag, setPostTag] = useState(TAGS[0]);
  const [postContent, setPostContent] = useState("");
  const [postFiles, setPostFiles] = useState([]); // up to MAX_POST_FILES
  const [fileDragging, setFileDragging] = useState(false);
  const [postSaving, setPostSaving] = useState(false);
  const [postError, setPostError] = useState("");
  const [dropUploadStatus, setDropUploadStatus] = useState(null); // null | 'uploading' | 'success' | 'error'
  const [dropUploadError, setDropUploadError] = useState("");
  const [deletingPostId, setDeletingPostId] = useState(null);
  const [tagDropdownOpen, setTagDropdownOpen] = useState(false);
  const contentRef = useRef(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoUploadError, setLogoUploadError] = useState("");
  const fileInputRef = useRef(null);
  const [cropSrc, setCropSrc] = useState(null);
  const [cropXY, setCropXY] = useState({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [cropArea, setCropArea] = useState(null);

  // Admin state
  const [adminProfiles, setAdminProfiles] = useState([]);
  const [auctionAdminCreatorId, setAuctionAdminCreatorId] = useState("");
  const [waiverAdminCreatorId, setWaiverAdminCreatorId] = useState("");
  const [adminPosts, setAdminPosts] = useState([]);
  const [adminSubCount, setAdminSubCount] = useState(0);
  const [roleUpdating, setRoleUpdating] = useState(null);
  const [referralCodeSaving, setReferralCodeSaving] = useState(null);
  const [referralCodeErrors, setReferralCodeErrors] = useState({});

  // Subscribers tab state (admin only)
  const [subscriberUsers, setSubscriberUsers] = useState([]);
  const [subscriberUsersLoading, setSubscriberUsersLoading] = useState(false);
  const [revealedEmails, setRevealedEmails] = useState(new Set());
  const [subscriberCategoryFilters, setSubscriberCategoryFilters] = useState(new Set(["admin", "creator", "paying", "nonpaying"])); // archive is off by default
  const [subscriberSearch, setSubscriberSearch] = useState("");

  // Revenue & Payouts state
  const [revenueSubscriptions, setRevenueSubscriptions] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [payoutSaving, setPayoutSaving] = useState(null);
  const [revenuePeriod, setRevenuePeriod] = useState("current");
  const [historicalRevenue, setHistoricalRevenue] = useState(null);
  const [historicalRevenueLoading, setHistoricalRevenueLoading] = useState(false);
  const [earningsPeriod, setEarningsPeriod] = useState("current");
  const [historicalPlatformRevenue, setHistoricalPlatformRevenue] = useState(null);
  const [historicalPlatformRevenueLoading, setHistoricalPlatformRevenueLoading] = useState(false);
  const [revenueCurrency, setRevenueCurrency] = useState("usd");

  // Feedback state (admin only)
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [feedbackSubTab, setFeedbackSubTab] = useState("help");

  // Player Database tab state
  const [playerDbList, setPlayerDbList] = useState([]);
  const [playerDbLoading, setPlayerDbLoading] = useState(false);
  const [playerDbSearch, setPlayerDbSearch] = useState('');
  const [playerDbPosFilter, setPlayerDbPosFilter] = useState('');
  const [playerDbSyncing, setPlayerDbSyncing] = useState(false);
  const [playerDbSyncResult, setPlayerDbSyncResult] = useState(null);
  const [playerDbSyncError, setPlayerDbSyncError] = useState('');

  // Admin add-player state
  const [showAdminAddPlayer, setShowAdminAddPlayer] = useState(false);
  const [adminPlayerName, setAdminPlayerName] = useState("");
  const [adminPlayerPos, setAdminPlayerPos] = useState("WR");
  const [adminPlayerTeam, setAdminPlayerTeam] = useState("");
  const [adminPlayerNearDups, setAdminPlayerNearDups] = useState([]);
  const [adminPlayerProceed, setAdminPlayerProceed] = useState(false);
  const [adminPlayerSaving, setAdminPlayerSaving] = useState(false);
  const [adminPlayerSaved, setAdminPlayerSaved] = useState("");
  const [adminPlayerError, setAdminPlayerError] = useState("");

  // Creator earnings state
  const [creatorSubs, setCreatorSubs] = useState([]);
  const [creatorPayouts, setCreatorPayouts] = useState([]);
  const [creatorActiveCreatorIds, setCreatorActiveCreatorIds] = useState([]);

  // Creator analytics state
  const [analyticsPageViews, setAnalyticsPageViews] = useState([]);
  const [analyticsPlayerClicks, setAnalyticsPlayerClicks] = useState([]);

  // Format lock state
  const [lockedFormats, setLockedFormats] = useState({});
  const [breakRankByFormat, setBreakRankByFormat] = useState({});
  const [breakRankInput, setBreakRankInput] = useState("");

  // Copy Rankings state
  const [savedFormats, setSavedFormats] = useState(new Set());
  const [showCopyMenu, setShowCopyMenu] = useState(false);
  const [copyConfirm, setCopyConfirm] = useState(null);

  // Floating buttons state
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [showFloatingSearch, setShowFloatingSearch] = useState(false);

  // Profile editing state
  const [profileName, setProfileName] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [profileHandle, setProfileHandle] = useState("");
  const [profileAnnouncement, setProfileAnnouncement] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);
  const [profileSaveError, setProfileSaveError] = useState("");

  // Full player pool from Supabase (canonical players table)
  const [playerPool, setPlayerPool] = useState([]);
  const [playersById, setPlayersById] = useState({});

  useEffect(() => {
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/"); return; }

      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();

      if (!prof || !(prof.role === "admin" || prof.is_creator)) {
        router.replace("/");
        return;
      }
      setProfile(prof);
      setProfileName(prof.display_name || "");
      setProfileBio(prof.bio || "");
      setProfileHandle(prof.handle || "");
      setProfileAnnouncement(prof.announcement || "");

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      if (prof.role === "admin") {
        setTab("admin");
        const [profilesRes, { data: allPosts }, subsRes, { data: allPayouts }, { data: allFeedback }] = await Promise.all([
          fetch('/api/profiles', { headers: { Authorization: `Bearer ${token}` } }),
          supabase.from("posts").select("*").order("created_at", { ascending: false }),
          fetch('/api/subscriptions', { headers: { Authorization: `Bearer ${token}` } }),
          supabase.from("payouts").select("*").order("created_at", { ascending: false }),
          supabase.from("feedback").select("*").order("created_at", { ascending: false }),
        ]);
        const { profiles: allProfiles } = profilesRes.ok ? await profilesRes.json() : { profiles: [] };
        const { subscriptions: adminSubs } = subsRes.ok ? await subsRes.json() : { subscriptions: [] };
        setAdminProfiles(allProfiles || []);
        setAdminPosts(allPosts || []);
        setAdminSubCount((adminSubs || []).length);
        setRevenueSubscriptions(adminSubs || []);
        setPayouts(allPayouts || []);
        setFeedbackItems(allFeedback || []);
      }

      if (prof.is_creator) {

        // Supabase caps an unpaginated select at 1000 rows — the players
        // table crossed that threshold once DST/K rows were added, so this
        // has to page through in batches or the tail silently vanishes.
        async function loadAllPlayers() {
          const PAGE = 1000;
          const rows = [];
          for (let from = 0; ; from += PAGE) {
            const { data: batch } = await supabase
              .from("players")
              .select("id, name, position, team, sleeper_id, espn_id")
              .order("adp_rank", { nullsFirst: false })
              .order("id")
              .range(from, from + PAGE - 1);
            rows.push(...(batch || []));
            if (!batch || batch.length < PAGE) break;
          }
          return rows;
        }

        const [rankingsRes, poolData] = await Promise.all([
          fetch(`/api/rankings?creator_id=${encodeURIComponent(prof.creator_id)}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          loadAllPlayers(),
        ]);

        const { rankings: savedRankings } = rankingsRes.ok ? await rankingsRes.json() : { rankings: [] };

        const pool = (poolData || []).map(p => ({ id: p.id, name: p.name, pos: p.position, team: p.team || "FA", sleeper_id: p.sleeper_id, espn_id: p.espn_id }));
        const byId = Object.fromEntries(pool.map(p => [p.id, p]));
        setPlayerPool(pool);
        setPlayersById(byId);

        const rankingsMap = {};
        const tiersMap = {};
        const lockedMap = {};
        const breakRankMap = {};
        for (const r of (savedRankings || [])) {
          const ranked = expandIds(r.players || [], byId);
          const unrankedArr = expandIds(r.unranked || [], byId).map(p => ({ ...p, unranked: true }));
          rankingsMap[r.format] = [...ranked, ...unrankedArr];
          tiersMap[r.format] = (r.tiers && r.tiers.length > 0) ? r.tiers : [...DEFAULT_TIERS];
          lockedMap[r.format] = r.locked || false;
          breakRankMap[r.format] = r.break_rank ?? null;
        }
        setLockedFormats(lockedMap);
        setBreakRankByFormat(breakRankMap);
        setBreakRankInput(String(breakRankMap[FORMATS[0]] ?? ""));
        setSavedFormats(new Set((savedRankings || []).map(r => r.format)));
        // For formats with no saved data yet, initialize with pool and default tiers.
        // DST/Kickers are scoped to their own position — the base formats mix
        // QB/RB/WR/TE together deliberately, but a DST list shouldn't get
        // topped up with every WR/RB in the database.
        for (const fmt of FORMATS) {
          const fmtPool = fmt === DST_FORMAT ? pool.filter(p => p.pos === "DST")
            : fmt === KICKER_FORMAT ? pool.filter(p => p.pos === "K")
            : pool;
          if (!rankingsMap[fmt]) rankingsMap[fmt] = [];
          if (rankingsMap[fmt].length === 0) {
            rankingsMap[fmt] = [...fmtPool];
          } else {
            const existingIds = new Set(rankingsMap[fmt].map(p => p.id));
            const missing = fmtPool.filter(p => !existingIds.has(p.id)).map(p => ({ ...p, unranked: true }));
            if (missing.length > 0) rankingsMap[fmt] = [...rankingsMap[fmt], ...missing];
          }
          if (!tiersMap[fmt]) tiersMap[fmt] = [...DEFAULT_TIERS];
        }

        // Auto-move FA players from ranked to unranked on load
        const savesNeeded = [];
        for (const fmt of FORMATS) {
          const players = rankingsMap[fmt] || [];
          const hasRankedFA = players.some(p => !p.unranked && p.team === "FA");
          if (hasRankedFA) {
            const ranked = players.filter(p => p.unranked || p.team !== "FA");
            const nowUnranked = players.filter(p => !p.unranked && p.team === "FA").map(p => ({ ...p, unranked: true }));
            rankingsMap[fmt] = [...ranked, ...nowUnranked];
            const rankedToSave = rankingsMap[fmt].filter(p => !p.unranked).map(p => p.id);
            const unrankedToSave = rankingsMap[fmt].filter(p => p.unranked).map(p => p.id);
            savesNeeded.push({ format: fmt, players: rankedToSave, unranked: unrankedToSave, tiers: tiersMap[fmt] });
          }
        }
        if (savesNeeded.length > 0) {
          await Promise.all(savesNeeded.map(({ format, players, unranked, tiers }) =>
            fetch('/api/rankings', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
              body: JSON.stringify({ creator_id: prof.creator_id, format, players, unranked, tiers }),
            })
          ));
        }

        setRankings(rankingsMap);
        setTiersByFormat(tiersMap);

        const { data: savedPosts } = await supabase
          .from("posts")
          .select("*")
          .eq("creator_id", prof.creator_id)
          .order("created_at", { ascending: false });

        setPosts(savedPosts || []);

        const twoWeeksAgo = new Date();
        twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

        const [creatorSubsRes, { data: myPayouts }, { data: pageViewData }, { data: playerClickData }, activeCreatorsRes] = await Promise.all([
          fetch('/api/subscriptions', { headers: { Authorization: `Bearer ${token}` } }),
          supabase.from("payouts").select("*").eq("creator_id", prof.creator_id).order("created_at", { ascending: false }),
          supabase.from("events").select("created_at").eq("creator_id", prof.creator_id).eq("event_type", "page_view").gte("created_at", twoWeeksAgo.toISOString()),
          supabase.from("events").select("player_id").eq("creator_id", prof.creator_id).eq("event_type", "player_click").not("player_id", "is", null),
          fetch('/api/creators/active').then(r => r.ok ? r.json() : { creators: [] }).catch(() => ({ creators: [] })),
        ]);
        const { subscriptions: creatorSubsData } = creatorSubsRes.ok ? await creatorSubsRes.json() : { subscriptions: [] };
        setCreatorSubs(creatorSubsData || []);
        setCreatorPayouts(myPayouts || []);
        setCreatorActiveCreatorIds((activeCreatorsRes.creators || []).map(c => c.creator_id));
        setAnalyticsPageViews(pageViewData || []);
        setAnalyticsPlayerClicks(playerClickData || []);
      }

      setLoading(false);
    }
    load();
  }, [router]);

  useEffect(() => {
    function onScroll() { setShowScrollTop(window.scrollY > 400); }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (rankingsSearch.trim()) return;
    const name = lastEditedPlayerRef.current;
    if (!name) return;
    lastEditedPlayerRef.current = null;
    const row = document.querySelector(`tr[data-player-name="${CSS.escape(name)}"]`);
    if (row) row.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [rankingsSearch]);

  useEffect(() => {
    if (tab === 'playerdb' && profile?.role === 'admin') loadPlayerDb();
    if (tab === 'subscribers' && (profile?.role === 'admin' || profile?.is_creator)) loadSubscriberUsers();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps

  // "current" isn't a real Stripe period — resolve it to this month's actual
  // YYYY-MM so the real Gross/Fees/Net breakdown shows for every period,
  // including the ongoing month, not just past ones.
  function resolvePeriod(period) {
    if (period !== "current") return period;
    const now = new Date();
    return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  useEffect(() => {
    if (tab !== 'payouts') return;
    fetchRevenuePeriod(resolvePeriod(revenuePeriod), setHistoricalRevenueLoading, setHistoricalRevenue);
  }, [tab, revenuePeriod]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (tab !== 'earnings') return;
    fetchRevenuePeriod(resolvePeriod(earningsPeriod), setHistoricalPlatformRevenueLoading, setHistoricalPlatformRevenue);
  }, [tab, earningsPeriod]); // eslint-disable-line react-hooks/exhaustive-deps

  async function updateFeedbackStatus(id, newStatus) {
    const supabase = createClient();
    await supabase.from("feedback").update({ status: newStatus }).eq("id", id);
    setFeedbackItems(prev => prev.map(f => f.id === id ? { ...f, status: newStatus } : f));
  }

  async function updateRole(profileId, newRole) {
    setRoleUpdating(profileId);
    const supabase = createClient();
    await supabase.from("profiles").update({ role: newRole }).eq("id", profileId);
    setAdminProfiles(prev => prev.map(p => p.id === profileId ? { ...p, role: newRole } : p));
    setRoleUpdating(null);
  }

  async function updateIsCreator(profileId, isCreator) {
    setRoleUpdating(profileId);
    const supabase = createClient();
    const update = { is_creator: isCreator };
    if (!isCreator) update.creator_id = null;
    await supabase.from("profiles").update(update).eq("id", profileId);
    setAdminProfiles(prev =>
      prev.map(p => p.id === profileId ? { ...p, is_creator: isCreator, ...(!isCreator ? { creator_id: null } : {}) } : p)
    );
    setRoleUpdating(null);
  }

  async function markAsPaid(creatorId, amount, period) {
    setPayoutSaving(creatorId);
    const supabase = createClient();
    const { data } = await supabase
      .from("payouts")
      .upsert(
        { creator_id: creatorId, amount, period, paid: true, paid_at: new Date().toISOString() },
        { onConflict: "creator_id,period" }
      )
      .select()
      .single();
    if (data) {
      setPayouts(prev => {
        const idx = prev.findIndex(p => p.creator_id === creatorId && p.period === period);
        return idx >= 0 ? prev.map((p, i) => (i === idx ? data : p)) : [data, ...prev];
      });
    }
    setPayoutSaving(null);
  }

  // "This Month" plus the last 12 calendar months plus YTD — real historical
  // totals for anything other than "current" come from Stripe's actual charge
  // history (the app itself has no historical revenue record of its own).
  const REVENUE_PERIOD_OPTIONS = (() => {
    const opts = [{ value: "current", label: "This Month" }];
    const now = new Date();
    for (let i = 1; i <= 12; i++) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const value = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
      opts.push({ value, label });
    }
    opts.push({ value: "ytd", label: "Year to Date" });
    return opts;
  })();

  async function fetchRevenuePeriod(period, setLoading, setData) {
    setLoading(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch(`/api/admin/revenue?period=${encodeURIComponent(period)}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      setData(res.ok ? await res.json() : { error: "Failed to load" });
    } catch {
      setData({ error: "Failed to load" });
    } finally {
      setLoading(false);
    }
  }

  async function updateCreatorId(profileId, newCreatorId) {
    setRoleUpdating(profileId);
    const supabase = createClient();
    await supabase.from("profiles").update({ creator_id: newCreatorId || null }).eq("id", profileId);
    setAdminProfiles(prev =>
      prev.map(p => p.id === profileId ? { ...p, creator_id: newCreatorId || null } : p)
    );
    setRoleUpdating(null);
  }

  async function updateReferralCode(profileId, newCode) {
    setReferralCodeSaving(profileId);
    setReferralCodeErrors(prev => ({ ...prev, [profileId]: "" }));
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/profiles', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ profileId, referral_code: newCode }),
    });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setAdminProfiles(prev =>
        prev.map(p => p.id === profileId ? { ...p, referral_code: body.profile?.referral_code ?? null } : p)
      );
    } else {
      setReferralCodeErrors(prev => ({ ...prev, [profileId]: body.error || "Failed to save" }));
    }
    setReferralCodeSaving(null);
  }

  function findNearDuplicates(name) {
    if (name.trim().length < 3) return [];
    const SUFFIX_RE = /[\s,]+(Jr\.?|Sr\.?|II|III|IV|V)$/i;
    const norm = n => n.toLowerCase().replace(/\./g, " ").trim().replace(/\s+/g, " ");
    const base = n => norm(n.replace(SUFFIX_RE, "").trim());
    function lev(a, b) {
      const m = a.length, n = b.length;
      const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++)
        for (let j = 1; j <= n; j++)
          dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
      return dp[m][n];
    }
    const inputNorm = norm(name);
    const inputBase = base(name);
    return playerPool.filter(p => {
      const pNorm = norm(p.name);
      const pBase = base(p.name);
      if (inputBase.length > 0 && pBase === inputBase) return true;
      if (inputNorm.length >= 6 && lev(inputNorm, pNorm) <= 2) return true;
      return false;
    }).slice(0, 5);
  }

  function handleAdminPlayerNameChange(name) {
    setAdminPlayerName(name);
    setAdminPlayerProceed(false);
    setAdminPlayerNearDups(findNearDuplicates(name));
  }

  async function createAdminPlayer() {
    if (!adminPlayerName.trim() || !adminPlayerPos || !adminPlayerTeam.trim()) return;
    setAdminPlayerSaving(true);
    setAdminPlayerError("");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/players', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ name: adminPlayerName.trim(), position: adminPlayerPos, team: adminPlayerTeam.trim().toUpperCase() }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to create player');
      const newPlayer = { id: body.id, name: adminPlayerName.trim(), pos: adminPlayerPos, team: adminPlayerTeam.trim().toUpperCase() };
      setPlayerPool(prev => [...prev, newPlayer]);
      setPlayersById(prev => ({ ...prev, [body.id]: newPlayer }));
      setAdminPlayerSaved(adminPlayerName.trim());
      setAdminPlayerName("");
      setAdminPlayerPos("WR");
      setAdminPlayerTeam("");
      setAdminPlayerNearDups([]);
      setAdminPlayerProceed(false);
      setShowAdminAddPlayer(false);
      setTimeout(() => setAdminPlayerSaved(""), 3000);
    } catch (err) {
      setAdminPlayerError(err.message);
    } finally {
      setAdminPlayerSaving(false);
    }
  }

  async function loadSubscriberUsers() {
    setSubscriberUsersLoading(true);
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/admin/users', {
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    const body = res.ok ? await res.json() : { users: [] };
    setSubscriberUsers(body.users || []);
    setSubscriberUsersLoading(false);
  }

  function toggleEmailReveal(userId) {
    setRevealedEmails(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  const PLAN_LABELS = { flat_access: "Full Access", legacy: "Legacy Plan", free_trial: "Free Trial", promo_5mo: "August Promo" };

  function subscriptionPlanLabel(sub) {
    if (!sub) return "No plan";
    return PLAN_LABELS[sub.plan_type] || sub.plan_type;
  }

  function signedUpLabel(createdAt) {
    if (!createdAt) return "—";
    return new Date(createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function subscriptionExpiresLabel(sub) {
    if (!sub) return "—";
    if (sub.trial_ends_at) {
      const label = new Date(sub.trial_ends_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      return sub.status === "expired" ? `Expired ${label}` : label;
    }
    return sub.status === "active" ? "Recurring monthly" : "—";
  }

  // Test accounts (email local part contains "+test") are archived regardless of
  // role, so they don't clutter the real admin/creator/subscriber counts. Beyond
  // that, role wins over subscription status — admins/creators get free platform
  // access regardless of any subscription row they happen to have.
  function subscriberCategory(u) {
    if ((u.email || "").split("@")[0].toLowerCase().includes("+test")) return "archive";
    if (u.role === "admin") return "admin";
    if (u.role === "creator" || u.is_creator) return "creator";
    const isPaying = u.subscription?.status === "active" && u.subscription.plan_type !== "free_trial";
    return isPaying ? "paying" : "nonpaying";
  }

  function toggleSubscriberCategory(category) {
    setSubscriberCategoryFilters(prev => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  }

  async function loadPlayerDb() {
    setPlayerDbLoading(true);
    const supabase = createClient();
    const all = [];
    const PAGE = 1000;
    for (let from = 0; ; from += PAGE) {
      const { data } = await supabase
        .from('players')
        .select('id, name, position, team, status, source, last_synced_at, sleeper_id, espn_id')
        .order('position').order('name')
        .range(from, from + PAGE - 1);
      all.push(...(data || []));
      if (!data || data.length < PAGE) break;
    }
    setPlayerDbList(all);
    setPlayerDbLoading(false);
  }

  async function triggerPlayerSync() {
    setPlayerDbSyncing(true);
    setPlayerDbSyncResult(null);
    setPlayerDbSyncError('');
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/players/sync', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    const body = await res.json();
    setPlayerDbSyncing(false);
    if (res.ok) {
      setPlayerDbSyncResult(body);
      loadPlayerDb();
    } else {
      setPlayerDbSyncError(body.error || 'Sync failed');
    }
  }

  async function toggleFormatLock(fmt) {
    const newLocked = !lockedFormats[fmt];
    setLockedFormats(prev => ({ ...prev, [fmt]: newLocked }));
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    await fetch('/api/rankings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ creator_id: profile.creator_id, format: fmt, locked: newLocked }),
    });
  }

  async function saveBreakRank(fmt, rawValue) {
    const prevValue = breakRankByFormat[fmt] ?? null;
    const value = rawValue === "" || rawValue == null ? null : Number(rawValue);
    setBreakRankByFormat(prev => ({ ...prev, [fmt]: value }));
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const res = await fetch('/api/rankings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
      body: JSON.stringify({ creator_id: profile.creator_id, format: fmt, break_rank: value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      console.error('[saveBreakRank] PATCH failed:', res.status, body);
      setBreakRankByFormat(prev => ({ ...prev, [fmt]: prevValue }));
      setBreakRankInput(prevValue != null ? String(prevValue) : "");
    }
  }

  async function saveProfile() {
    setProfileSaving(true);
    setProfileSaveError("");
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/profile', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          display_name: profileName,
          handle: profileHandle,
          bio: profileBio,
          announcement: profileAnnouncement,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Save failed');
      setProfile(prev => ({ ...prev, display_name: profileName, bio: profileBio, handle: profileHandle, announcement: profileAnnouncement || null }));
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err) {
      console.error('[saveProfile] failed:', err);
      setProfileSaveError(err.message || 'Save failed — try again');
    } finally {
      setProfileSaving(false);
    }
  }

  function handleDragStart(e, index) {
    dragIndex.current = index;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    if (draggedSeparatorTier.current !== null) {
      const rank = index + 1;
      if (rank >= 2) {
        setTierDropRank(rank);
        tierDropTarget.current = rank;
      }
      return;
    }
    if (dragIndex.current === null || dragIndex.current === index) return;
    const full = pendingRankings.current || rankings[activeFormat] || [];
    const ranked = [...full.filter(p => !p.unranked)];
    const unrankedArr = full.filter(p => p.unranked);
    const [dragged] = ranked.splice(dragIndex.current, 1);
    ranked.splice(index, 0, dragged);
    dragIndex.current = index;
    const newFull = [...ranked, ...unrankedArr];
    pendingRankings.current = newFull;
    setRankings(prev => ({ ...prev, [activeFormat]: newFull }));
  }

  async function saveRankingsNow(full, tiersOverride) {
    const rankedOnly = full.filter(p => !p.unranked).map(p => p.id);
    const unrankedOnly = full.filter(p => p.unranked).map(p => p.id);
    const tiers = tiersOverride !== undefined ? tiersOverride : (tiersByFormat[activeFormat] || DEFAULT_TIERS);
    setRankingsSaving(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/rankings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ creator_id: profile.creator_id, format: activeFormat, players: rankedOnly, unranked: unrankedOnly, tiers }),
      });
      const responseBody = await res.json();
      if (!res.ok) throw new Error(responseBody.error || 'Save failed');
      setRankingsSaved(true);
      setTimeout(() => setRankingsSaved(false), 2000);
    } catch (err) {
      console.error('[rankings] save failed:', err);
      setRankingsSaveError(true);
      setTimeout(() => setRankingsSaveError(false), 4000);
    } finally {
      setRankingsSaving(false);
    }
  }

  async function handleDragEnd() {
    if (draggedSeparatorTier.current !== null) return;
    const players = pendingRankings.current;
    const finalIdx = dragIndex.current;
    dragIndex.current = null;
    pendingRankings.current = null;
    if (!players) return;
    const ranked = players.filter(p => !p.unranked);
    if (finalIdx !== null && ranked[finalIdx]) lastEditedPlayerRef.current = ranked[finalIdx].name;
    await saveRankingsNow(players);
  }

  function moveToUnranked(playerName) {
    const full = [...(rankings[activeFormat] || [])];
    const idx = full.findIndex(p => p.name === playerName);
    if (idx === -1) return;
    const [player] = full.splice(idx, 1);
    full.push({ ...player, unranked: true });
    setRankings(prev => ({ ...prev, [activeFormat]: full }));
    saveRankingsNow(full);
    setConfirmRemovePlayer(null);
  }

  // removeCompletely removed — canonical players stay in unranked; deactivation is admin-only

  function addFromUnranked(playerName) {
    const full = [...(rankings[activeFormat] || [])];
    const idx = full.findIndex(p => p.name === playerName);
    if (idx === -1) return;
    const [player] = full.splice(idx, 1);
    const { unranked: _, ...cleanPlayer } = player;
    const firstUnranked = full.findIndex(p => p.unranked);
    full.splice(firstUnranked === -1 ? full.length : firstUnranked, 0, cleanPlayer);
    setRankings(prev => ({ ...prev, [activeFormat]: full }));
    saveRankingsNow(full);
  }

  function addPlayer(player) {
    const full = rankings[activeFormat] || [];
    const firstUnranked = full.findIndex(p => p.unranked);
    const newFull = firstUnranked === -1
      ? [...full, player]
      : [...full.slice(0, firstUnranked), player, ...full.slice(firstUnranked)];
    setRankings(prev => ({ ...prev, [activeFormat]: newFull }));
    saveRankingsNow(newFull);
    setShowAddPlayer(false);
    setAddPlayerSearch("");
    setAddPlayerResults([]);
  }


  function handleAddPlayerSearch(query) {
    setAddPlayerSearch(query);
    if (!query.trim()) { setAddPlayerResults([]); return; }
    const usedNames = new Set((rankings[activeFormat] || []).map(p => p.name));
    // DST/Kickers rankings shouldn't let a creator accidentally add a WR/RB/etc.
    const posGate = activeFormat === DST_FORMAT ? (p => p.pos === "DST")
      : activeFormat === KICKER_FORMAT ? (p => p.pos === "K")
      : () => true;
    const results = playerPool
      .filter(p => !usedNames.has(p.name) && posGate(p) && p.name.toLowerCase().includes(query.toLowerCase().trim()))
      .slice(0, 10);
    setAddPlayerResults(results);
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImportError("");
    setImportRows([]);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const raw = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      if (raw.length === 0) { setImportError("The spreadsheet appears to be empty."); return; }
      const get = (row, candidates) => {
        const key = Object.keys(row).find(k => candidates.includes(k.trim().toLowerCase()));
        return key ? String(row[key]).trim() : "";
      };
      const parsed = raw
        .map((row, i) => ({
          rank: parseInt(get(row, ["rank", "#", "no", "number"])) || (i + 1),
          name: get(row, ["name", "player", "player name", "playername"]),
          pos: get(row, ["position", "pos"]).toUpperCase() || "",
          team: get(row, ["team", "tm", "nfl team"]) || "FA",
        }))
        .filter(r => r.name);
      if (parsed.length === 0) { setImportError("No player names found. Make sure your sheet has a 'Name' column."); return; }
      parsed.sort((a, b) => a.rank - b.rank);
      setImportRows(parsed);
    } catch (err) {
      setImportError("Failed to parse file: " + err.message);
    }
  }

  async function confirmImport() {
    if (importRows.length === 0) return;
    setImportLoading(true);
    const normalizeName = n => n.toLowerCase().replace(/\./g, " ").trim().replace(/\s+/g, " ");
    const poolByNorm = {};
    for (const p of playerPool) poolByNorm[normalizeName(p.name)] = p;
    const skipped = [];
    const newRanked = importRows.map(row => {
      const match = poolByNorm[normalizeName(row.name)] || null;
      if (!match) skipped.push(row.name);
      return match;
    }).filter(Boolean);
    const newRankedIds = new Set(newRanked.map(p => p.id));
    const preservedUnranked = (rankings[activeFormat] || [])
      .filter(p => p.unranked && !newRankedIds.has(p.id))
      .map(({ unranked: _, ...p }) => ({ ...p, unranked: true }));
    const full = [...newRanked, ...preservedUnranked];
    setRankings(prev => ({ ...prev, [activeFormat]: full }));
    await saveRankingsNow(full);
    setImportRows([]);
    setImportError("");
    setImportLoading(false);
    if (skipped.length > 0) {
      setImportSkipped(skipped);
    } else {
      setShowImport(false);
    }
  }

  function movePlayerToRank(playerName, targetRank) {
    const full = rankings[activeFormat] || [];
    const ranked = [...full.filter(p => !p.unranked)];
    const unrankedArr = full.filter(p => p.unranked);
    const fromIndex = ranked.findIndex(p => p.name === playerName);
    if (fromIndex === -1) return;
    const toIndex = Math.max(0, Math.min(targetRank - 1, ranked.length - 1));
    if (fromIndex === toIndex) return;
    const [moved] = ranked.splice(fromIndex, 1);
    ranked.splice(toIndex, 0, moved);
    const newFull = [...ranked, ...unrankedArr];
    lastEditedPlayerRef.current = playerName;
    setRankings(prev => ({ ...prev, [activeFormat]: newFull }));
    saveRankingsNow(newFull);
  }

  function handlePlayerClick(e, playerName, list, listPlayers) {
    if (!e.shiftKey) {
      setSelectedPlayers(prev => {
        if (prev.size === 1 && prev.has(playerName)) return new Set();
        return new Set([playerName]);
      });
      setLastClickedPlayer({ name: playerName, list });
      return;
    }
    if (!lastClickedPlayer || lastClickedPlayer.list !== list) {
      setSelectedPlayers(new Set([playerName]));
      setLastClickedPlayer({ name: playerName, list });
      return;
    }
    const anchorIdx = listPlayers.findIndex(p => p.name === lastClickedPlayer.name);
    const clickIdx = listPlayers.findIndex(p => p.name === playerName);
    if (anchorIdx === -1 || clickIdx === -1) {
      setSelectedPlayers(new Set([playerName]));
      setLastClickedPlayer({ name: playerName, list });
      return;
    }
    const [start, end] = anchorIdx < clickIdx ? [anchorIdx, clickIdx] : [clickIdx, anchorIdx];
    setSelectedPlayers(new Set(listPlayers.slice(start, end + 1).map(p => p.name)));
  }

  function bulkMoveToUnranked() {
    const full = [...(rankings[activeFormat] || [])];
    const updated = full.map(p => selectedPlayers.has(p.name) && !p.unranked ? { ...p, unranked: true } : p);
    const ranked = updated.filter(p => !p.unranked);
    const unrankedArr = updated.filter(p => p.unranked);
    const newFull = [...ranked, ...unrankedArr];
    setRankings(prev => ({ ...prev, [activeFormat]: newFull }));
    saveRankingsNow(newFull);
    setSelectedPlayers(new Set());
    setLastClickedPlayer(null);
  }


  function confirmAddTier() {
    const pos = parseInt(addTierRank, 10);
    const maxRank = (rankings[activeFormat] || []).filter(p => !p.unranked).length;
    const current = tiersByFormat[activeFormat] || DEFAULT_TIERS;
    if (!Number.isInteger(pos) || isNaN(pos) || pos < 1) {
      setAddTierError("Please enter a positive whole number.");
      return;
    }
    if (pos >= maxRank) {
      setAddTierError(`Must be less than ${maxRank} (your total ranked players).`);
      return;
    }
    const newTierStart = pos + 1;
    if (current.includes(newTierStart)) {
      setAddTierError(`A tier boundary already exists after rank ${pos}.`);
      return;
    }
    const newTiers = [...current, newTierStart].sort((a, b) => a - b);
    setTiersByFormat(prev => ({ ...prev, [activeFormat]: newTiers }));
    saveRankingsNow(rankings[activeFormat] || [], newTiers);
    setShowAddTierModal(false);
    setAddTierRank("");
    setAddTierError("");
  }

  function handleCopyFormat(sourceFormat) {
    const destHasRanked = (rankings[activeFormat] || []).some(p => !p.unranked);
    if (destHasRanked) {
      setCopyConfirm({ sourceFormat });
    } else {
      applyCopy(sourceFormat);
    }
  }

  function applyCopy(sourceFormat) {
    const src = sourceFormat || copyConfirm?.sourceFormat;
    setRankings(prev => ({ ...prev, [activeFormat]: [...(rankings[src] || [])] }));
    setTiersByFormat(prev => ({ ...prev, [activeFormat]: [...(tiersByFormat[src] || DEFAULT_TIERS)] }));
    setSavedFormats(prev => new Set([...prev, activeFormat]));
    setCopyConfirm(null);
  }

  function removeTier(tierIndex) {
    const current = [...(tiersByFormat[activeFormat] || DEFAULT_TIERS)];
    current.splice(tierIndex, 1);
    setTiersByFormat(prev => ({ ...prev, [activeFormat]: current }));
    saveRankingsNow(rankings[activeFormat] || [], current);
  }

  function handleSeparatorDragStart(e, tierIndex) {
    draggedSeparatorTier.current = tierIndex;
    e.dataTransfer.effectAllowed = "move";
  }

  function handleSeparatorDragEnd() {
    const tierIndex = draggedSeparatorTier.current;
    const targetRank = tierDropTarget.current;
    draggedSeparatorTier.current = null;
    tierDropTarget.current = null;
    setTierDropRank(null);
    if (tierIndex === null || targetRank === null) return;
    if (targetRank < 2) return;
    const current = [...(tiersByFormat[activeFormat] || DEFAULT_TIERS)];
    current[tierIndex] = targetRank;
    const sorted = [1, ...current.slice(1).sort((a, b) => a - b)];
    const deduped = sorted.filter((v, i, arr) => i === 0 || v !== arr[i - 1]);
    setTiersByFormat(prev => ({ ...prev, [activeFormat]: deduped }));
    saveRankingsNow(rankings[activeFormat] || [], deduped);
  }

  function handleFileDragOver(e) {
    e.preventDefault();
    if (dropUploadStatus === 'uploading') return;
    setFileDragging(true);
  }

  function handleFileDragLeave() {
    setFileDragging(false);
  }

  async function handleFileDrop(e) {
    e.preventDefault();
    setFileDragging(false);
    if (dropUploadStatus === 'uploading') return;
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length === 0) return;

    if (files.length > MAX_POST_FILES) {
      setDropUploadStatus('error');
      setDropUploadError(`Too many files — max ${MAX_POST_FILES}`);
      return;
    }
    const oversized = files.find((f) => f.size > MAX_POST_FILE_BYTES);
    if (oversized) {
      setDropUploadStatus('error');
      setDropUploadError(`"${oversized.name}" is too large — max 20 MB per file`);
      return;
    }

    // Auto-save: upload files and create post immediately on drop
    setDropUploadStatus('uploading');
    setDropUploadError('');

    const supabase = createClient();
    const file_urls = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const path = `${profile.creator_id}/${Date.now()}-${i}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(path, file, { upsert: true });
      if (uploadError) {
        setDropUploadStatus('error');
        setDropUploadError(`Upload failed: ${uploadError.message}`);
        return;
      }
      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path);
      file_urls.push(urlData.publicUrl);
    }

    const title = files[0].name.replace(/\.[^.]+$/, '');

    const { data: newPost, error: insertError } = await supabase
      .from('posts')
      .insert({ creator_id: profile.creator_id, title, tag: 'Analysis', content: '', file_url: file_urls[0], file_urls })
      .select()
      .single();

    if (insertError) {
      setDropUploadStatus('error');
      setDropUploadError(`Save failed: ${insertError.message}`);
      return;
    }

    setPosts(prev => [newPost, ...prev]);
    setDropUploadStatus('success');
    setTimeout(() => setDropUploadStatus(null), 3000);
  }

  async function handleCreatePost(e) {
    e.preventDefault();
    if (!postTitle.trim() || !postContent.trim()) return;
    setPostSaving(true);
    setPostError('');

    const supabase = createClient();
    const file_urls = [];

    for (let i = 0; i < postFiles.length; i++) {
      const file = postFiles[i];
      const path = `${profile.creator_id}/${Date.now()}-${i}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('posts')
        .upload(path, file, { upsert: true });
      if (uploadError) {
        setPostError(`File upload failed: ${uploadError.message}`);
        setPostSaving(false);
        return;
      }
      const { data: urlData } = supabase.storage.from('posts').getPublicUrl(path);
      file_urls.push(urlData.publicUrl);
    }

    const { data: newPost, error: insertError } = await supabase
      .from('posts')
      .insert({
        creator_id: profile.creator_id,
        title: postTitle,
        tag: postTag.trim() || TAGS[0],
        content: postContent,
        file_url: file_urls[0] ?? null,
        file_urls: file_urls.length > 0 ? file_urls : null,
      })
      .select()
      .single();

    if (insertError) {
      setPostError(`Failed to publish: ${insertError.message}`);
      setPostSaving(false);
      return;
    }

    setPosts(prev => [newPost, ...prev]);
    setPostTitle('');
    setPostContent('');
    setPostFiles([]);
    setPostSaving(false);
  }

  async function handleDeletePost(post) {
    if (!window.confirm("Delete this post? This can't be undone.")) return;
    setDeletingPostId(post.id);

    const supabase = createClient();

    const urls = post.file_urls?.length ? post.file_urls : (post.file_url ? [post.file_url] : []);
    if (urls.length > 0) {
      const marker = '/storage/v1/object/public/posts/';
      const storagePaths = urls
        .map((url) => {
          const idx = url.indexOf(marker);
          return idx !== -1 ? decodeURIComponent(url.slice(idx + marker.length)) : null;
        })
        .filter(Boolean);
      if (storagePaths.length > 0) await supabase.storage.from('posts').remove(storagePaths);
    }

    const { error } = await supabase.from('posts').delete().eq('id', post.id);
    setDeletingPostId(null);

    if (error) {
      alert(`Delete failed: ${error.message}`);
      return;
    }

    setPosts(prev => prev.filter(p => p.id !== post.id));
  }

  function openCropModal(file) {
    if (!file || !file.type.startsWith("image/")) {
      setLogoUploadError("Please select an image file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = e => {
      setCropSrc(e.target.result);
      setCropZoom(1);
      setCropXY({ x: 0, y: 0 });
      setCropArea(null);
    };
    reader.readAsDataURL(file);
  }

  async function confirmCrop() {
    if (!cropSrc || !cropArea) return;
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = cropSrc;
    });
    const SIZE = 400;
    const canvas = document.createElement("canvas");
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext("2d");
    ctx.beginPath();
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, 2 * Math.PI);
    ctx.clip();
    ctx.drawImage(image, cropArea.x, cropArea.y, cropArea.width, cropArea.height, 0, 0, SIZE, SIZE);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/png"));
    if (!blob) { setLogoUploadError("Crop failed — please try again."); return; }
    setCropSrc(null);
    await handleLogoUpload(new File([blob], "logo.png", { type: "image/png" }));
  }

  async function handleLogoUpload(file) {
    if (!file || !file.type.startsWith("image/")) {
      setLogoUploadError("Please select an image file.");
      return;
    }
    setLogoUploading(true);
    setLogoUploadError("");

    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();

      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: formData,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Upload failed");

      setProfile(prev => ({ ...prev, logo_url: body.publicUrl }));
    } catch (err) {
      setLogoUploadError(err.message || "Upload failed — try again.");
    } finally {
      setLogoUploading(false);
    }
  }

  function applyInlineFormat(prefix, suffix) {
    const ta = contentRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const before = postContent.slice(0, start);
    const selected = postContent.slice(start, end);
    const after = postContent.slice(end);
    setPostContent(before + prefix + selected + suffix + after);
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, end + prefix.length);
    });
  }

  function applyLinePrefix(prefix) {
    const ta = contentRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const lineStart = postContent.lastIndexOf('\n', start - 1) + 1;
    setPostContent(postContent.slice(0, lineStart) + prefix + postContent.slice(lineStart));
    requestAnimationFrame(() => {
      ta.focus();
      ta.setSelectionRange(start + prefix.length, start + prefix.length);
    });
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        Loading...
      </div>
    );
  }

  const allFormatPlayers = rankings[activeFormat] || [];
  const currentPlayers = allFormatPlayers.filter(p => !p.unranked);
  const unrankedPlayers = allFormatPlayers.filter(p => p.unranked);

  const rankingsPosRanks = {};
  const rPos = {};
  for (const p of currentPlayers) {
    rPos[p.pos] = (rPos[p.pos] || 0) + 1;
    rankingsPosRanks[p.name] = `${p.pos}${rPos[p.pos]}`;
  }

  const filteredCurrentPlayers = rankingsSearch.trim()
    ? currentPlayers.filter(p => p.name.toLowerCase().includes(rankingsSearch.toLowerCase().trim()))
    : currentPlayers;

  // Revenue computation
  // Active creators for flat_access attribution — derived live from profiles so a new
  // creator joining automatically factors into the no-code split without a manual step.
  const activeCreatorIds = adminProfiles.filter(p => p.is_creator && p.creator_id).map(p => p.creator_id);
  let totalRevenue = 0;
  const creatorBreakdown = {};
  const ensureBreakdown = (id) => {
    if (!creatorBreakdown[id]) creatorBreakdown[id] = { included: 0, addons: 0, flatCoded: 0, flatSplitShare: 0 };
    return creatorBreakdown[id];
  };
  const paidThisMonth = (sub) => {
    const created = new Date(sub.created_at);
    const now = new Date();
    return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
  };
  for (const sub of revenueSubscriptions) {
    // Free-trial subs (e.g. comped for the signup-bug incident) count toward
    // "active subscribers" but contribute $0 until they convert to a paid plan.
    if (sub.plan_type === "free_trial") continue;
    if (sub.plan_type === "promo_5mo") {
      // August promo: a real one-time $10 payment for 5 months of access. It only
      // counts as revenue in the calendar month it was actually collected — not
      // every month the sub stays active — so this doesn't inflate MRR 5x.
      if (paidThisMonth(sub)) {
        totalRevenue += 10;
        if (sub.referral_creator_id && activeCreatorIds.includes(sub.referral_creator_id)) {
          ensureBreakdown(sub.referral_creator_id).flatCoded++;
        } else if (activeCreatorIds.length > 0) {
          activeCreatorIds.forEach(id => { ensureBreakdown(id).flatSplitShare += 1 / activeCreatorIds.length; });
        }
      }
      continue;
    }
    if (sub.plan_type === "flat_access") {
      totalRevenue += 10;
      if (sub.referral_creator_id && activeCreatorIds.includes(sub.referral_creator_id)) {
        // Coded signup: 80% to the coded creator. The remaining 20% is platform
        // revenue, same convention as the legacy included/add-on split below.
        ensureBreakdown(sub.referral_creator_id).flatCoded++;
      } else if (activeCreatorIds.length > 0) {
        // No code (or code didn't match a currently-active creator): the full $10
        // splits evenly across whichever creators are active right now — recomputed
        // on every render, so it reflects the roster at payment time, not signup time.
        activeCreatorIds.forEach(id => { ensureBreakdown(id).flatSplitShare += 1 / activeCreatorIds.length; });
      }
      continue;
    }
    totalRevenue += 10;
    if (sub.included_creator) {
      ensureBreakdown(sub.included_creator).included++;
    }
    if (sub.add_on_creators) {
      const addOns = Array.isArray(sub.add_on_creators)
        ? sub.add_on_creators
        : sub.add_on_creators.split(",").filter(Boolean);
      addOns.forEach(id => {
        totalRevenue += 5;
        ensureBreakdown(id).addons++;
      });
    }
  }
  // Per-creator earnings: legacy 80% of included/add-on revenue, flat-access coded
  // subs at 80% of $10, flat-access no-code subs at 100% of their even split share
  // (the no-code case has no platform cut — the full $10 is redistributed).
  let creatorPayoutTotal = 0;
  for (const id in creatorBreakdown) {
    const d = creatorBreakdown[id];
    d.earnings = d.included * 8 + d.addons * 4 + d.flatCoded * 8 + d.flatSplitShare * 10;
    creatorPayoutTotal += d.earnings;
  }
  // Platform revenue is whatever's left after creator payouts, rather than a blanket
  // 20% of totalRevenue — that blanket formula would overcount the platform's cut on
  // no-code flat_access subs, which pay creators 100% with no platform share.
  const platformRevenue = totalRevenue - creatorPayoutTotal;
  const currentPeriod = new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const adminTabs = [["admin", "Admin Overview"], ["subscribers", "Subscribers"], ["payouts", "Revenue & Payouts"], ["feedback", "Feedback"], ["players", "Add Players"], ["playerdb", "Player Database"], ["admin-auction", "Auction Rankings"], ["waiver-wire-admin", "Waiver Wire"]];
  const creatorTabs = ["rankings", "auction", "waiver-wire", "posts", "earnings", "analytics", "subscribers", "profile"].map((t) => [
    t,
    t === "rankings" ? "My Rankings" : t === "auction" ? "My Auction" : t === "waiver-wire" ? "My Waiver Wire" : t === "posts" ? "My Posts" : t === "earnings" ? "My Earnings" : t === "analytics" ? "My Analytics" : t === "subscribers" ? "Subscribers" : "My Profile",
  ]);

  return (
    <>
    <main className="min-h-screen text-[#0F172A] lg:pl-56">
      <NavBar activePath="/dashboard" />

      <div className="max-w-[1600px] mx-auto px-6 py-10">
        <div className="mb-8 flex flex-wrap items-start justify-between gap-y-3">
          <div className="flex items-center gap-4">
            {profile.is_creator && (
              <CreatorAvatar
                logoUrl={profile.logo_url}
                initials={(profile.creator_id || "?").slice(0, 2).toUpperCase()}
                colorClass="bg-blue-600"
                size="lg"
              />
            )}
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold">Welcome back, {profile.display_name}</h1>
              <p className="text-gray-500 mt-1 inline-flex items-center gap-2 flex-wrap">
                {profile.role === "admin" && (
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block"></span>Admin
                  </span>
                )}
                {profile.role === "admin" && profile.is_creator && <span className="text-gray-300">·</span>}
                {profile.is_creator && (
                  <span>Creator · @{profile.creator_id}</span>
                )}
              </p>
            </div>
          </div>
          {profile.role === "admin" && (
            <span className="bg-red-50 border border-red-200 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-lg">
              ADMIN
            </span>
          )}
        </div>

        <div className="lg:flex lg:gap-8 lg:items-start">
          {/* Desktop: dashboard tabs as a second, left-side column */}
          <nav className="hidden lg:flex lg:flex-col lg:gap-1.5 lg:w-52 lg:shrink-0 lg:sticky lg:top-10">
            {profile.role === "admin" && (
              <>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 pt-1 pb-0.5">Admin</p>
                {adminTabs.map(([t, label]) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`text-left px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                      tab === t
                        ? "bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white"
                        : "bg-white/60 backdrop-blur-sm text-gray-500 hover:bg-white/80 border border-white/70"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </>
            )}
            {profile.is_creator && (
              <>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 pt-3 pb-0.5">Creator</p>
                {creatorTabs.map(([t, label]) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`text-left px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
                      tab === t
                        ? "bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white"
                        : "bg-white/60 backdrop-blur-sm text-gray-500 hover:bg-white/80 border border-white/70"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </>
            )}
          </nav>

          <div className="flex-1 min-w-0">

        {/* Row 1 — Dashboard tabs (mobile only — desktop uses the left column above) */}
        <div className="lg:hidden flex gap-1.5 mb-6 overflow-x-auto pb-1">
          {profile.role === "admin" && (
            adminTabs.map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  tab === t
                    ? "bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white"
                    : "bg-white/60 backdrop-blur-sm text-gray-500 hover:bg-white/80 border border-white/70"
                }`}
              >
                {label}
              </button>
            ))
          )}
          {profile.is_creator && (
            creatorTabs.map(([t, label]) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                  tab === t
                    ? "bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white"
                    : "bg-white/60 backdrop-blur-sm text-gray-500 hover:bg-white/80 border border-white/70"
                }`}
              >
                {label}
              </button>
            ))
          )}
        </div>

        {/* ── Admin Tab ── */}
        {tab === "admin" && (
          <div>
            {/* Stats row */}
            <div className="grid grid-cols-3 gap-2 lg:gap-4 mb-8">
              {[
                { label: "Total Users", value: adminProfiles.length },
                { label: "Creators", value: adminProfiles.filter(p => p.is_creator).length },
                { label: "Subscribers", value: adminSubCount },
              ].map(({ label, value }) => (
                <div key={label} className="bg-white/70 backdrop-blur-md border border-white/80 shadow-lg rounded-xl p-2 lg:p-5 text-center">
                  <p className="text-lg lg:text-3xl font-bold text-blue-600">{value}</p>
                  <p className="text-gray-500 text-[10px] lg:text-sm mt-0.5 lg:mt-1">{label}</p>
                </div>
              ))}
            </div>

            {/* Users table */}
            <h2 className="text-lg font-bold mb-3">Users</h2>
            <div className="bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg overflow-hidden mb-8">
              <div className="overflow-x-auto">
              <table className="w-full max-sm:[&_th]:px-2 max-sm:[&_th]:py-1.5 max-sm:[&_th]:text-[10px] max-sm:[&_td]:px-2 max-sm:[&_td]:py-1.5 max-sm:[&_td]:text-xs">
                <thead className="bg-white/40 text-gray-500 text-sm">
                  <tr>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Role</th>
                    <th className="text-left px-4 py-3">Change Role</th>
                    <th className="text-left px-4 py-3">Creator?</th>
                    <th className="text-left px-4 py-3">Creator ID</th>
                    <th className="text-left px-4 py-3">Referral Code</th>
                  </tr>
                </thead>
                <tbody>
                  {adminProfiles.map((p) => (
                    <tr key={p.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium">
                        {p.display_name || "—"}
                        {p.is_creator && (
                          <span className="ml-2 text-xs bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded font-semibold">creator</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          p.role === "admin" ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500"
                        }`}>
                          {p.role}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={p.role}
                          disabled={roleUpdating === p.id}
                          onChange={(e) => updateRole(p.id, e.target.value)}
                          className="bg-gray-50 border border-gray-200 rounded px-2 py-1 text-sm text-[#0F172A] focus:outline-none focus:border-blue-500 disabled:opacity-50"
                        >
                          <option value="subscriber">subscriber</option>
                          <option value="creator">creator</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button
                          disabled={roleUpdating === p.id}
                          onClick={() => updateIsCreator(p.id, !p.is_creator)}
                          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
                            p.is_creator ? "bg-blue-600" : "bg-gray-200"
                          }`}
                        >
                          <span className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                            p.is_creator ? "translate-x-4" : "translate-x-1"
                          }`} />
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        {p.is_creator ? (
                          <select
                            value={p.creator_id || ""}
                            disabled={roleUpdating === p.id}
                            onChange={(e) => updateCreatorId(p.id, e.target.value)}
                            className={`bg-gray-50 border rounded px-2 py-1 text-sm text-[#0F172A] focus:outline-none focus:border-blue-500 disabled:opacity-50 ${
                              p.creator_id ? "border-gray-200" : "border-amber-400"
                            }`}
                          >
                            <option value="">— assign —</option>
                            {CREATOR_IDS.map((id) => (
                              <option key={id} value={id}>{id}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.is_creator ? (
                          <div>
                            <input
                              type="text"
                              key={p.id}
                              defaultValue={p.referral_code || ""}
                              disabled={referralCodeSaving === p.id}
                              onBlur={(e) => {
                                const val = e.target.value.trim();
                                if (val !== (p.referral_code || "")) updateReferralCode(p.id, val);
                              }}
                              placeholder="e.g. HUDDLE"
                              className="bg-gray-50 border border-gray-200 rounded px-2 py-1 text-sm text-[#0F172A] focus:outline-none focus:border-blue-500 disabled:opacity-50 w-28"
                            />
                            {referralCodeErrors[p.id] && (
                              <p className="text-red-500 text-xs mt-1">{referralCodeErrors[p.id]}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-gray-400 text-sm">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {adminProfiles.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">No profiles found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>

            {/* Recent posts */}
            <h2 className="text-lg font-bold mb-3">Recent Posts</h2>
            <div className="flex flex-col gap-3">
              {adminPosts.slice(0, 10).map((post) => (
                <div key={post.id} className="bg-white/70 backdrop-blur-md rounded-xl p-4 border border-white/80 shadow-lg flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{post.title}</p>
                    <p className="text-gray-400 text-xs mt-0.5">
                      @{post.creator_id} · {new Date(post.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                  <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded shrink-0 font-medium">{post.tag}</span>
                </div>
              ))}
              {adminPosts.length === 0 && (
                <div className="bg-white/70 backdrop-blur-md rounded-xl p-8 border border-white/80 shadow-lg text-center">
                  <p className="text-gray-400 text-sm">No posts published yet.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Subscribers Tab ── */}
        {tab === "subscribers" && (() => {
          const CATEGORY_LABELS = { admin: "Admin", creator: "Creator", paying: "Paying Subscriber", nonpaying: "Non-Paying Subscriber", archive: "Archive" };
          const CATEGORY_ACTIVE_CLASS = {
            admin: "bg-red-600 text-white",
            creator: "bg-blue-600 text-white",
            paying: "bg-green-600 text-white",
            nonpaying: "bg-gray-500 text-white",
            archive: "bg-amber-500 text-white",
          };
          const search = subscriberSearch.trim().toLowerCase();
          const filteredSubscriberUsers = subscriberUsers.filter(u => {
            if (!subscriberCategoryFilters.has(subscriberCategory(u))) return false;
            if (!search) return true;
            const name = (u.display_name || (u.email ? u.email.split("@")[0] : "")).toLowerCase();
            const email = (u.email || "").toLowerCase();
            return name.includes(search) || email.includes(search);
          });

          return (
          <div>
            <h2 className="text-lg font-bold mb-3">Subscribers</h2>
            <p className="text-gray-500 text-sm mb-4">Click a name to reveal their email.</p>

            <div className="flex flex-wrap items-center gap-2 mb-4">
              {Object.keys(CATEGORY_LABELS).map(cat => (
                <button
                  key={cat}
                  onClick={() => toggleSubscriberCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors shrink-0 ${
                    subscriberCategoryFilters.has(cat)
                      ? CATEGORY_ACTIVE_CLASS[cat]
                      : "bg-white/60 backdrop-blur-sm text-gray-400 border border-white/70"
                  }`}
                >
                  {CATEGORY_LABELS[cat]}
                </button>
              ))}
              <input
                type="text"
                placeholder="Search by name or email…"
                value={subscriberSearch}
                onChange={e => setSubscriberSearch(e.target.value)}
                className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-[#0F172A] placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-w-52 ml-auto"
              />
            </div>

            <div className="bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full max-sm:[&_th]:px-2 max-sm:[&_th]:py-1.5 max-sm:[&_th]:text-[10px] max-sm:[&_td]:px-2 max-sm:[&_td]:py-1.5 max-sm:[&_td]:text-xs">
                <thead className="bg-white/40 text-gray-500 text-sm">
                  <tr>
                    <th className="text-left px-4 py-3">Name</th>
                    <th className="text-left px-4 py-3">Role</th>
                    <th className="text-left px-4 py-3">Plan</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Expires</th>
                    <th className="text-left px-4 py-3">Signed Up</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubscriberUsers.map((u) => (
                    <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <button
                          onClick={() => toggleEmailReveal(u.id)}
                          className="font-medium text-blue-600 hover:text-blue-700 text-left"
                        >
                          {u.display_name || (u.email ? u.email.split("@")[0] : "Unnamed user")}
                        </button>
                        {revealedEmails.has(u.id) && (
                          <p className="text-xs text-gray-400 mt-0.5 break-all">{u.email || "no email on file"}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                          u.role === "admin" ? "bg-red-50 text-red-600" : u.role === "creator" ? "bg-blue-50 text-blue-600" : "bg-gray-100 text-gray-500"
                        }`}>
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{subscriptionPlanLabel(u.subscription)}</td>
                      <td className="px-4 py-3">
                        {u.subscription ? (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                            u.subscription.status === "active" ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"
                          }`}>
                            {u.subscription.status}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-sm">No subscription</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600">{subscriptionExpiresLabel(u.subscription)}</td>
                      <td className="px-4 py-3 text-gray-600">{signedUpLabel(u.created_at)}</td>
                    </tr>
                  ))}
                  {subscriberUsersLoading && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">Loading...</td></tr>
                  )}
                  {!subscriberUsersLoading && filteredSubscriberUsers.length === 0 && (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                      {subscriberUsers.length === 0 ? "No users found." : "No users match the current filters."}
                    </td></tr>
                  )}
                </tbody>
              </table>
              </div>
            </div>
          </div>
          );
        })()}

        {/* ── Revenue & Payouts Tab ── */}
        {tab === "payouts" && (
          <div>
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <label className="text-xs font-semibold text-gray-500">Period:</label>
              <select
                value={revenuePeriod}
                onChange={(e) => setRevenuePeriod(e.target.value)}
                className="bg-white rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
              >
                {REVENUE_PERIOD_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <div className="flex gap-1 ml-1">
                {["usd", "cad"].map((c) => (
                  <button
                    key={c}
                    onClick={() => setRevenueCurrency(c)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase transition-colors ${
                      revenueCurrency === c ? "bg-[#2563EB] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>
            </div>

            <div className="bg-white/70 backdrop-blur-md border border-white/80 shadow-lg rounded-xl p-5 mb-8">
              {historicalRevenueLoading ? (
                <p className="text-gray-400 text-sm">Loading real revenue history from Stripe...</p>
              ) : historicalRevenue?.error ? (
                <p className="text-red-500 text-sm">{historicalRevenue.error}</p>
              ) : historicalRevenue ? (
                <>
                  <p className="text-[#0F172A] text-sm font-medium mb-3">{historicalRevenue.label}</p>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <p className="text-xl lg:text-2xl font-bold text-[#0F172A]">${historicalRevenue[revenueCurrency].totalRevenue.toLocaleString()}</p>
                      <p className="text-gray-500 text-xs mt-0.5">Gross Revenue</p>
                    </div>
                    <div>
                      <p className="text-xl lg:text-2xl font-bold text-red-500">-${historicalRevenue[revenueCurrency].stripeFees.toLocaleString()}</p>
                      <p className="text-gray-500 text-xs mt-0.5">Stripe Fees</p>
                    </div>
                    <div>
                      <p className="text-xl lg:text-2xl font-bold text-blue-600">${historicalRevenue[revenueCurrency].netRevenue.toLocaleString()}</p>
                      <p className="text-gray-500 text-xs mt-0.5">Net Revenue</p>
                    </div>
                  </div>
                  <p className="text-gray-400 text-xs">
                    {historicalRevenue.chargeCount} successful charge{historicalRevenue.chargeCount === 1 ? "" : "s"} · sourced live from Stripe
                    {revenueCurrency === "usd"
                      ? " (fees converted to USD at each charge's own settlement rate)"
                      : " (native CAD settlement amounts — exactly what Stripe pays out, no conversion)"}
                  </p>
                  {revenuePeriod !== "current" && (
                    <p className="text-gray-400 text-xs mt-3 max-w-md">
                      Platform/creator payout splits aren&apos;t available for past periods — checked both Stripe (no referral/creator data was ever attached to charges or subscriptions) and the app&apos;s own database (only tracks each subscriber&apos;s <em>current</em> plan, not historical), so an accurate split can&apos;t be reconstructed. The current month&apos;s live split is shown below.
                    </p>
                  )}
                </>
              ) : null}
            </div>

            {revenuePeriod === "current" && (
              <>
            <div className="grid grid-cols-2 gap-2 lg:gap-4 mb-8">
              {[
                { label: "Platform Revenue", value: `$${platformRevenue.toLocaleString()}`, sub: "after creator payouts" },
                { label: "Creator Payouts", value: `$${creatorPayoutTotal.toLocaleString()}`, sub: "owed to creators" },
              ].map(({ label, value, sub }) => (
                <div key={label} className="bg-white/70 backdrop-blur-md border border-white/80 shadow-lg rounded-xl p-2 lg:p-5">
                  <p className="text-sm lg:text-2xl font-bold text-blue-600">{value}</p>
                  <p className="text-[#0F172A] text-[10px] lg:text-sm font-medium mt-0.5 lg:mt-1">{label}</p>
                  <p className="hidden lg:block text-gray-400 text-xs mt-0.5">{sub}</p>
                </div>
              ))}
            </div>

            <h2 className="text-lg font-bold mb-3">Creator Payouts — {currentPeriod}</h2>
            <div className="bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg overflow-hidden mb-8">
              <div className="overflow-x-auto">
              <table className="w-full max-sm:[&_th]:px-2 max-sm:[&_th]:py-1.5 max-sm:[&_th]:text-[10px] max-sm:[&_td]:px-2 max-sm:[&_td]:py-1.5 max-sm:[&_td]:text-xs">
                <thead className="bg-white/40 text-gray-500 text-sm">
                  <tr>
                    <th className="text-left px-4 py-3">Creator</th>
                    <th className="text-left px-4 py-3">Included subs</th>
                    <th className="text-left px-4 py-3">Add-on subs</th>
                    <th className="text-left px-4 py-3">Flat (coded)</th>
                    <th className="text-left px-4 py-3">Flat (split)</th>
                    <th className="text-left px-4 py-3">Monthly earnings</th>
                    <th className="text-left px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {activeCreatorIds.map(creatorId => {
                    const data = creatorBreakdown[creatorId] || { included: 0, addons: 0, flatCoded: 0, flatSplitShare: 0, earnings: 0 };
                    const earnings = data.earnings || 0;
                    const payout = payouts.find(p => p.creator_id === creatorId && p.period === currentPeriod);
                    const isSaving = payoutSaving === creatorId;
                    return (
                      <tr key={creatorId} className="border-b border-gray-100">
                        <td className="px-4 py-4">
                          <p className="font-medium">@{creatorId}</p>
                        </td>
                        <td className="px-4 py-4">
                          <span className="font-mono">{data.included}</span>
                          <span className="text-gray-400 text-xs ml-1">× $8</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="font-mono">{data.addons}</span>
                          <span className="text-gray-400 text-xs ml-1">× $4</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="font-mono">{data.flatCoded}</span>
                          <span className="text-gray-400 text-xs ml-1">× $8</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className="font-mono">{data.flatSplitShare.toFixed(2)}</span>
                          <span className="text-gray-400 text-xs ml-1">× $10</span>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`text-lg font-bold ${earnings > 0 ? "text-blue-600" : "text-gray-300"}`}>
                            ${earnings.toFixed(2)}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          {payout?.paid ? (
                            <div>
                              <span className="text-green-600 text-sm font-semibold">✅ Paid</span>
                              <p className="text-gray-400 text-xs mt-0.5">
                                {new Date(payout.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                              </p>
                            </div>
                          ) : (
                            <button
                              onClick={() => markAsPaid(creatorId, earnings, currentPeriod)}
                              disabled={isSaving || earnings === 0}
                              className="bg-white hover:bg-gray-50 border border-gray-200 text-[#0F172A] text-sm font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              {isSaving ? "Saving..." : "Mark as Paid"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
              </>
            )}

            <h2 className="text-lg font-bold mb-3">Payout History</h2>
            {payouts.length === 0 ? (
              <div className="bg-white/70 backdrop-blur-md rounded-xl p-8 border border-white/80 shadow-lg text-center">
                <p className="text-gray-400 text-sm">No payouts recorded yet.</p>
              </div>
            ) : (
              <div className="bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full max-sm:[&_th]:px-2 max-sm:[&_th]:py-1.5 max-sm:[&_th]:text-[10px] max-sm:[&_td]:px-2 max-sm:[&_td]:py-1.5 max-sm:[&_td]:text-xs">
                  <thead className="bg-white/40 text-gray-500 text-sm">
                    <tr>
                      <th className="text-left px-4 py-3">Creator</th>
                      <th className="text-left px-4 py-3">Period</th>
                      <th className="text-left px-4 py-3">Amount</th>
                      <th className="text-left px-4 py-3">Paid on</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.filter(p => p.paid).map(p => (
                      <tr key={p.id} className="border-b border-gray-100">
                        <td className="px-4 py-3 font-medium">@{p.creator_id}</td>
                        <td className="px-4 py-3 text-gray-500">{p.period}</td>
                        <td className="px-4 py-3 text-blue-600 font-semibold">${p.amount}</td>
                        <td className="px-4 py-3 text-gray-400 text-sm">
                          {new Date(p.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Feedback Tab (admin only) ── */}
        {tab === "feedback" && (
          <div>
            {/* Sub-tabs */}
            <div className="flex gap-0 border-b border-gray-200 mb-6">
              {[["help", "Help Requests"], ["idea", "Ideas"]].map(([key, label]) => {
                const count = feedbackItems.filter(f => f.type === key).length;
                return (
                  <button
                    key={key}
                    onClick={() => setFeedbackSubTab(key)}
                    className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                      feedbackSubTab === key
                        ? "border-blue-600 text-blue-600"
                        : "border-transparent text-gray-500 hover:text-gray-700"
                    }`}
                  >
                    {label}
                    <span className={`ml-2 text-xs px-1.5 py-0.5 rounded-full font-semibold ${
                      feedbackSubTab === key ? "bg-blue-100 text-blue-600" : "bg-gray-100 text-gray-400"
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            {(() => {
              const rows = feedbackItems.filter(f => f.type === feedbackSubTab);
              const statusBadge = (status) => {
                if (status === "in_progress") return "bg-amber-50 text-amber-600 border border-amber-200";
                if (status === "resolved") return "bg-green-50 text-green-600 border border-green-200";
                return "bg-blue-50 text-blue-600 border border-blue-200";
              };
              const statusLabel = (status) => {
                if (status === "in_progress") return "In Progress";
                if (status === "resolved") return "Resolved";
                return "New";
              };
              if (rows.length === 0) {
                return (
                  <div className="bg-white/70 backdrop-blur-md rounded-xl p-10 border border-white/80 shadow-lg text-center">
                    <p className="text-gray-400 text-sm">No {feedbackSubTab === "help" ? "help requests" : "ideas"} yet.</p>
                  </div>
                );
              }
              return (
                <div className="bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full max-sm:[&_th]:px-2 max-sm:[&_th]:py-1.5 max-sm:[&_th]:text-[10px] max-sm:[&_td]:px-2 max-sm:[&_td]:py-1.5 max-sm:[&_td]:text-xs">
                    <thead className="bg-white/40 text-gray-500 text-xs uppercase tracking-wider">
                      <tr>
                        <th className="text-left px-4 py-3">Name</th>
                        <th className="text-left px-4 py-3">Email</th>
                        <th className="text-left px-4 py-3">Subject</th>
                        <th className="text-left px-4 py-3">Message</th>
                        <th className="text-left px-4 py-3">Date</th>
                        <th className="text-left px-4 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((f) => (
                        <tr key={f.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors align-top">
                          <td className="px-4 py-3 text-sm font-medium whitespace-nowrap">{f.name || "—"}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{f.email}</td>
                          <td className="px-4 py-3 text-sm text-gray-700 max-w-[140px]">
                            <span className="line-clamp-2">{f.subject || "—"}</span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500 max-w-[240px]">
                            <span className="line-clamp-3">{f.message}</span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">
                            {new Date(f.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1.5 items-start">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusBadge(f.status)}`}>
                                {statusLabel(f.status)}
                              </span>
                              <select
                                value={f.status || "new"}
                                onChange={(e) => updateFeedbackStatus(f.id, e.target.value)}
                                className="text-xs bg-gray-50 border border-gray-200 rounded px-1.5 py-1 text-[#0F172A] focus:outline-none focus:border-blue-500"
                              >
                                <option value="new">New</option>
                                <option value="in_progress">In Progress</option>
                                <option value="resolved">Resolved</option>
                              </select>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* ── Add Players Tab ── */}
        {tab === "players" && (
          <div>
            <h2 className="text-xl font-bold mb-1">Player Database</h2>
            <p className="text-gray-500 text-sm mb-6">Add players to the shared database. New players appear in every creator's Unranked list automatically.</p>
            <div className="bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg p-5 max-w-lg">
              {adminPlayerSaved && (
                <div className="mb-4 px-4 py-2.5 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm font-medium">
                  "{adminPlayerSaved}" added to player database.
                </div>
              )}
              {!showAdminAddPlayer ? (
                <button
                  onClick={() => setShowAdminAddPlayer(true)}
                  className="flex items-center gap-2 text-blue-600 font-medium text-sm hover:text-blue-700 transition-colors"
                >
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">+</span>
                  Add New Player
                </button>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-1">
                      <label className="block text-xs font-medium text-gray-500 mb-1">Name</label>
                      <input
                        type="text"
                        value={adminPlayerName}
                        onChange={e => handleAdminPlayerNameChange(e.target.value)}
                        placeholder="e.g. Marvin Harrison Jr."
                        autoFocus
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0F172A] placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Position</label>
                      <select
                        value={adminPlayerPos}
                        onChange={e => setAdminPlayerPos(e.target.value)}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:border-blue-500"
                      >
                        {["QB", "RB", "WR", "TE"].map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Team</label>
                      <input
                        type="text"
                        value={adminPlayerTeam}
                        onChange={e => setAdminPlayerTeam(e.target.value.toUpperCase())}
                        placeholder="e.g. DAL"
                        maxLength={4}
                        className="w-full bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#0F172A] placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  {adminPlayerNearDups.length > 0 && !adminPlayerProceed && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-amber-800 font-semibold text-sm mb-2">⚠ Similar player(s) already exist:</p>
                      <div className="flex flex-col gap-1.5 mb-3">
                        {adminPlayerNearDups.map(p => (
                          <div key={p.id} className="flex items-center gap-2 text-sm">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${posColors[p.pos] || "bg-gray-100 text-gray-500"}`}>{p.pos}</span>
                            <span className="font-medium text-[#0F172A]">{p.name}</span>
                            <span className="text-gray-500">{p.team}</span>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setAdminPlayerProceed(true)}
                        className="text-xs font-medium text-amber-700 hover:text-amber-900 underline"
                      >
                        This is a different person — proceed anyway
                      </button>
                    </div>
                  )}

                  {adminPlayerError && (
                    <p className="text-red-600 text-sm">{adminPlayerError}</p>
                  )}

                  <div className="flex gap-3 items-center">
                    <button
                      onClick={createAdminPlayer}
                      disabled={adminPlayerSaving || !adminPlayerName.trim() || !adminPlayerTeam.trim() || (adminPlayerNearDups.length > 0 && !adminPlayerProceed)}
                      className="px-4 py-2 bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white text-sm font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {adminPlayerSaving ? "Saving…" : "Add Player"}
                    </button>
                    <button
                      onClick={() => {
                        setShowAdminAddPlayer(false);
                        setAdminPlayerName(""); setAdminPlayerPos("WR"); setAdminPlayerTeam("");
                        setAdminPlayerNearDups([]); setAdminPlayerProceed(false); setAdminPlayerError("");
                      }}
                      className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Player Database Tab ── */}
        {tab === "playerdb" && (() => {
          const filtered = playerDbList.filter(p => {
            if (playerDbPosFilter && p.position !== playerDbPosFilter) return false;
            if (playerDbSearch) {
              const q = playerDbSearch.toLowerCase();
              return p.name?.toLowerCase().includes(q) || p.team?.toLowerCase().includes(q);
            }
            return true;
          });
          return (
            <div>
              <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
                <div>
                  <h2 className="text-xl font-bold mb-1">Player Database</h2>
                  <p className="text-gray-500 text-sm">All players sourced from Sleeper or added manually. Syncs daily at 4am UTC.</p>
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <button
                    onClick={triggerPlayerSync}
                    disabled={playerDbSyncing}
                    className="px-4 py-2 bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white text-sm font-semibold rounded-lg hover:brightness-110 transition-all disabled:opacity-50 whitespace-nowrap"
                  >
                    {playerDbSyncing ? 'Syncing…' : 'Sync Now'}
                  </button>
                  {playerDbSyncResult && (
                    <span className="text-xs text-green-600 font-medium">
                      Done — {playerDbSyncResult.total} active players · {playerDbSyncResult.bridged} bridged · {playerDbSyncResult.upserted} upserted
                    </span>
                  )}
                  {playerDbSyncError && (
                    <span className="text-xs text-red-600">{playerDbSyncError}</span>
                  )}
                </div>
              </div>

              <div className="flex gap-3 mb-4 flex-wrap items-center">
                <input
                  type="text"
                  placeholder="Search by name or team…"
                  value={playerDbSearch}
                  onChange={e => setPlayerDbSearch(e.target.value)}
                  className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-[#0F172A] placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 min-w-52"
                />
                <select
                  value={playerDbPosFilter}
                  onChange={e => setPlayerDbPosFilter(e.target.value)}
                  className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-[#0F172A] focus:outline-none focus:border-blue-500"
                >
                  <option value="">All Positions</option>
                  {['QB', 'RB', 'WR', 'TE'].map(pos => <option key={pos} value={pos}>{pos}</option>)}
                </select>
                <span className="text-xs text-gray-400">{filtered.length} of {playerDbList.length} players</span>
              </div>

              {playerDbLoading ? (
                <p className="text-gray-400 text-sm py-8 text-center">Loading…</p>
              ) : (
                <div className="bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full text-sm max-sm:[&_th]:px-2 max-sm:[&_th]:py-1.5 max-sm:[&_th]:text-[10px] max-sm:[&_td]:px-2 max-sm:[&_td]:py-1.5 max-sm:[&_td]:text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 bg-white/40">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Name</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Pos</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Team</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Status</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Source</th>
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500">Last Synced</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(p => (
                        <tr key={p.id} className="border-b border-gray-50 hover:bg-white/50">
                          <td className="px-4 py-2.5 font-medium text-[#0F172A]">
                            <div className="flex items-center gap-2">
                              <PlayerHeadshot espnId={p.position === "DST" ? null : p.espn_id} sleeperId={p.position === "DST" ? null : p.sleeper_id} name={p.name} size="xs" label={p.position === "DST" ? p.team : null} />
                              {p.name}
                            </div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${posColors[p.position] || 'bg-gray-100 text-gray-500'}`}>
                              {p.position}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-600">{p.team || '—'}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs font-medium ${
                              p.status === 'Active' ? 'text-green-600' :
                              p.status ? 'text-amber-600' : 'text-gray-400'
                            }`}>
                              {p.status || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                              p.source === 'sleeper' ? 'bg-purple-50 text-purple-700' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {p.source === 'sleeper' ? 'Sleeper' : 'Manual'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">
                            {p.last_synced_at
                              ? new Date(p.last_synced_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                              : '—'}
                          </td>
                        </tr>
                      ))}
                      {filtered.length === 0 && (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-gray-400 text-sm">
                            {playerDbList.length === 0 ? 'No players yet. Run a sync to import from Sleeper.' : 'No players match your filters.'}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Admin: Auction Rankings Tab ── */}
        {tab === "admin-auction" && (() => {
          const creators = adminProfiles.filter(p => p.is_creator && p.creator_id);
          return (
            <div>
              <h2 className="text-lg font-bold text-[#0F172A] mb-4">Auction Rankings — Admin</h2>
              <div className="flex items-center gap-2 mb-4">
                <label className="text-xs font-semibold text-gray-500">Creator:</label>
                <select
                  value={auctionAdminCreatorId}
                  onChange={(e) => setAuctionAdminCreatorId(e.target.value)}
                  className="bg-white rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a creator...</option>
                  {creators.map(c => (
                    <option key={c.creator_id} value={c.creator_id}>{c.display_name || c.creator_id}</option>
                  ))}
                </select>
              </div>
              {auctionAdminCreatorId ? (
                <AuctionRankingsEditor
                  key={auctionAdminCreatorId}
                  creatorId={auctionAdminCreatorId}
                  creatorLabel={creators.find(c => c.creator_id === auctionAdminCreatorId)?.display_name || auctionAdminCreatorId}
                />
              ) : (
                <p className="text-sm text-gray-400">Pick a creator above to view or edit their auction rankings.</p>
              )}
            </div>
          );
        })()}

        {tab === "waiver-wire-admin" && (() => {
          const creators = adminProfiles.filter(p => p.is_creator && p.creator_id);
          return (
            <div>
              <h2 className="text-lg font-bold text-[#0F172A] mb-4">Waiver Wire — Admin</h2>
              <div className="flex items-center gap-2 mb-4">
                <label className="text-xs font-semibold text-gray-500">Creator:</label>
                <select
                  value={waiverAdminCreatorId}
                  onChange={(e) => setWaiverAdminCreatorId(e.target.value)}
                  className="bg-white rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select a creator...</option>
                  {creators.map(c => (
                    <option key={c.creator_id} value={c.creator_id}>{c.display_name || c.creator_id}</option>
                  ))}
                </select>
              </div>
              {waiverAdminCreatorId ? (
                <WaiverWireEditor
                  key={waiverAdminCreatorId}
                  creatorId={waiverAdminCreatorId}
                  creatorLabel={creators.find(c => c.creator_id === waiverAdminCreatorId)?.display_name || waiverAdminCreatorId}
                />
              ) : (
                <p className="text-sm text-gray-400">Pick a creator above to view or edit their waiver wire.</p>
              )}
            </div>
          );
        })()}

        {/* ── Rankings Tab ── */}
        {tab === "rankings" && (
          <div onClick={() => { setSelectedPlayers(new Set()); setLastClickedPlayer(null); }}>
            {/* Row 2 — Format tabs */}
            <div className="flex gap-2 mb-3 pb-3 border-b border-gray-100 overflow-x-auto">
              {FORMATS.map((fmt) => (
                <button
                  key={fmt}
                  onClick={() => { setActiveFormat(fmt); setRankingsSaved(false); setShowAddPlayer(false); setAddPlayerSearch(""); setAddPlayerResults([]); setBreakRankInput(String(breakRankByFormat[fmt] ?? "")); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors shrink-0 ${
                    activeFormat === fmt
                      ? "bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white"
                      : "bg-white/60 backdrop-blur-sm text-gray-600 hover:bg-white/80 border border-white/70"
                  }`}
                >
                  {fmt}
                  {lockedFormats[fmt] && <span className="ml-1.5 text-xs">🔒</span>}
                </button>
              ))}
            </div>

            {/* Row 3 — Action toolbar */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <button
                type="button"
                onClick={() => toggleFormatLock(activeFormat)}
                className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-medium transition-colors border shrink-0 ${
                  lockedFormats[activeFormat]
                    ? "bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100"
                    : "bg-white/60 backdrop-blur-sm text-gray-500 hover:text-gray-700 border-white/70 hover:bg-white/80"
                }`}
              >
                {lockedFormats[activeFormat] ? "🔒 Under Review" : "🔓 Lock for editing"}
              </button>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-xs text-gray-400">Break at rank:</span>
                <input
                  type="number"
                  min="1"
                  max={currentPlayers.length || undefined}
                  placeholder="—"
                  value={breakRankInput}
                  onChange={e => setBreakRankInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveBreakRank(activeFormat, breakRankInput); }}
                  className="w-16 bg-white/60 border border-white/70 rounded-lg px-2 py-1.5 text-xs text-center text-[#0F172A] focus:outline-none focus:border-blue-400"
                />
                <button
                  type="button"
                  onClick={() => saveBreakRank(activeFormat, breakRankInput)}
                  className="text-xs px-2.5 py-1.5 rounded-lg font-medium bg-white/60 border border-white/70 text-gray-600 hover:bg-white/80 transition-colors"
                >Set</button>
                {breakRankByFormat[activeFormat] != null && (
                  <button
                    type="button"
                    onClick={() => { setBreakRankInput(""); saveBreakRank(activeFormat, null); }}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors px-1"
                    title="Clear break"
                  >✕</button>
                )}
              </div>
              {(() => {
                const otherSavedFormats = FORMATS.filter(f => f !== activeFormat && savedFormats.has(f));
                return (
                  <div className="relative shrink-0">
                    {showCopyMenu && <div className="fixed inset-0 z-40" onClick={() => setShowCopyMenu(false)} />}
                    <button
                      type="button"
                      disabled={otherSavedFormats.length === 0}
                      title={otherSavedFormats.length === 0 ? "No other rankings to copy from yet" : undefined}
                      onClick={() => setShowCopyMenu(prev => !prev)}
                      className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 bg-white/60 backdrop-blur-sm border border-white/70 hover:bg-white/80 px-3 py-2 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      Copy Rankings
                    </button>
                    {showCopyMenu && otherSavedFormats.length > 0 && (
                      <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-xl shadow-xl border border-gray-100 py-1 min-w-44">
                        <p className="text-xs text-gray-400 px-3 pt-1 pb-1">Copy from:</p>
                        {otherSavedFormats.map(fmt => (
                          <button
                            key={fmt}
                            type="button"
                            onClick={() => { setShowCopyMenu(false); handleCopyFormat(fmt); }}
                            className="w-full text-left text-sm text-gray-700 hover:bg-gray-50 px-3 py-2 transition-colors"
                          >{fmt}</button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}
              <button
                type="button"
                onClick={() => { setShowImport(true); setImportRows([]); setImportError(""); setImportSkipped([]); }}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 bg-white/60 backdrop-blur-sm border border-white/70 hover:bg-white/80 px-3 py-2 rounded-lg font-medium transition-colors shrink-0"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                Import Excel
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-y-2 mb-4">
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-gray-400 text-sm">Drag to reorder, or click any rank number and type a new position. Changes save automatically.</p>
                {rankingsSaving && <span className="text-gray-400 text-xs">Saving...</span>}
                {!rankingsSaving && rankingsSaved && <span className="text-green-600 text-xs font-medium">Saved ✓</span>}
                {!rankingsSaving && rankingsSaveError && <span className="text-red-500 text-xs font-medium">Save failed — check console</span>}
              </div>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <button
                  type="button"
                  onClick={() => setShowUnranked(prev => !prev)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 font-medium transition-colors"
                >
                  <span>{showUnranked ? "▼" : "▶"}</span>
                  Unranked ({unrankedPlayers.length})
                </button>
              </div>
            </div>

            {/* Unranked Players panel */}
            {showUnranked && unrankedPlayers.length > 0 && (
              <div className="mb-4 bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg overflow-hidden">
                <div className="overflow-x-auto">
                <table className="w-full max-sm:[&_th]:px-2 max-sm:[&_th]:py-1.5 max-sm:[&_th]:text-[10px] max-sm:[&_td]:px-2 max-sm:[&_td]:py-1.5 max-sm:[&_td]:text-xs">
                  <tbody>
                    {unrankedPlayers.map(player => (
                      <tr
                        key={player.name}
                        className={`group border-b border-gray-100 last:border-0 transition-colors ${selectedPlayers.has(player.name) ? "bg-blue-50" : "hover:bg-gray-50"}`}
                        onClick={(e) => { e.stopPropagation(); handlePlayerClick(e, player.name, "unranked", unrankedPlayers); }}
                      >
                        <td className="px-4 py-2.5 font-medium text-sm">
                          <div className="flex items-center gap-2">
                            <PlayerHeadshot espnId={player.pos === "DST" ? null : player.espn_id} sleeperId={player.pos === "DST" ? null : player.sleeper_id} name={player.name} size="xs" label={player.pos === "DST" ? player.team : null} />
                            {player.name}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${posColors[player.pos] || "bg-gray-100 text-gray-500"}`}>{player.pos}</span>
                        </td>
                        <td className="hidden sm:table-cell px-4 py-2.5 text-gray-500 text-sm">{player.team}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => addFromUnranked(player.name)}
                              className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 font-medium px-3 py-1 rounded-lg transition-colors"
                            >+ Add to Rankings</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </div>
              </div>
            )}

            {/* Add Player */}
            <div className="bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg p-4 relative mb-4">
              {!showAddPlayer ? (
                <button
                  type="button"
                  onClick={() => setShowAddPlayer(true)}
                  className="flex items-center gap-2 text-blue-600 font-medium text-sm hover:text-blue-700 transition-colors"
                >
                  <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">+</span>
                  Add Player
                </button>
              ) : (
                <div>
                  <input
                    type="text"
                    value={addPlayerSearch}
                    onChange={(e) => handleAddPlayerSearch(e.target.value)}
                    placeholder="Search players to add..."
                    autoFocus
                    className="w-full bg-white border border-gray-200 rounded-lg px-4 py-2.5 text-[#0F172A] placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 text-sm"
                  />
                  {addPlayerResults.length > 0 && (
                    <div className="absolute left-4 right-4 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden">
                      {addPlayerResults.map(p => (
                        <button
                          key={p.name}
                          type="button"
                          onClick={() => addPlayer(p)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors text-left border-b border-gray-50 last:border-0"
                        >
                          <PlayerHeadshot espnId={p.pos === "DST" ? null : p.espn_id} sleeperId={p.pos === "DST" ? null : p.sleeper_id} name={p.name} size="xs" label={p.pos === "DST" ? p.team : null} />
                          <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${posColors[p.pos] || "bg-gray-100 text-gray-500"}`}>{p.pos}</span>
                          <span className="font-medium text-sm">{p.name}</span>
                          <span className="text-gray-400 text-xs ml-auto">{p.team}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => { setShowAddPlayer(false); setAddPlayerSearch(""); setAddPlayerResults([]); }}
                    className="mt-2 text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >Cancel</button>
                </div>
              )}
            </div>

            <div className="mb-4">
              <input
                type="text"
                value={rankingsSearch}
                onChange={e => setRankingsSearch(e.target.value)}
                placeholder="Search players..."
                className="w-full bg-white/60 backdrop-blur-sm border border-white/70 rounded-xl px-4 py-2.5 text-[#0F172A] placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="bg-white/60 backdrop-blur-md rounded-xl overflow-hidden border border-white/70 shadow-lg mb-4">
              <div className="overflow-x-auto">
              <table className="w-full max-sm:[&_th]:px-2 max-sm:[&_th]:py-1.5 max-sm:[&_th]:text-[10px] max-sm:[&_td]:px-2 max-sm:[&_td]:py-1.5 max-sm:[&_td]:text-xs">
                <thead className="bg-white/40 text-gray-500 text-sm">
                  <tr>
                    <th className="text-left px-4 py-3 w-12">#</th>
                    <th className="text-left px-4 py-3">Player</th>
                    <th className="text-left px-4 py-3">Pos</th>
                    <th className="hidden sm:table-cell text-left px-4 py-3">Team</th>
                    <th className="w-8 px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCurrentPlayers.map((player, _i) => {
                    const actualIndex = currentPlayers.findIndex(p => p.name === player.name);
                    const rank = actualIndex + 1;
                    const activeTiers = tiersByFormat[activeFormat] || DEFAULT_TIERS;
                    const separatorTierIndex = !rankingsSearch.trim()
                      ? activeTiers.findIndex((start, i) => i > 0 && start === rank)
                      : -1;
                    return (
                      <Fragment key={player.name}>
                        {rank === 1 && !rankingsSearch.trim() && (
                          <tr className="select-none pointer-events-none">
                            <td colSpan={5} className="py-2 px-4">
                              <div className="flex items-center gap-2">
                                <div className="flex-1 h-px bg-gray-200" />
                                <span className="text-xs font-semibold text-gray-400 tracking-wider uppercase">Tier 1</span>
                                <div className="flex-1 h-px bg-gray-200" />
                              </div>
                            </td>
                          </tr>
                        )}
                        {separatorTierIndex > 0 && (
                          <tr
                            draggable
                            onDragStart={(e) => handleSeparatorDragStart(e, separatorTierIndex)}
                            onDragEnd={handleSeparatorDragEnd}
                            onDragOver={(e) => e.preventDefault()}
                            className="select-none group/sep cursor-grab active:cursor-grabbing hover:bg-blue-50/30 transition-colors"
                          >
                            <td colSpan={5} className="py-2 px-4">
                              <div className="flex items-center gap-2">
                                <span className="text-gray-300 text-sm leading-none">⠿⠿</span>
                                <div className="flex-1 h-px bg-gray-200" />
                                <span className="text-xs font-semibold text-gray-400 tracking-wider uppercase">Tier {separatorTierIndex + 1}</span>
                                {activeTiers.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); removeTier(separatorTierIndex); }}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    className="opacity-0 group-hover/sep:opacity-100 text-xs text-red-400 hover:text-red-600 transition-all"
                                  >Remove</button>
                                )}
                                <div className="flex-1 h-px bg-gray-200" />
                                <span className="text-gray-300 text-sm leading-none">⠿⠿</span>
                              </div>
                            </td>
                          </tr>
                        )}
                      <tr
                        draggable
                        data-player-name={player.name}
                        onDragStart={(e) => handleDragStart(e, actualIndex)}
                        onDragOver={(e) => handleDragOver(e, actualIndex)}
                        onDragEnd={handleDragEnd}
                        onClick={(e) => { e.stopPropagation(); handlePlayerClick(e, player.name, "ranked", filteredCurrentPlayers); }}
                        className={`group border-b border-gray-100 transition-colors cursor-grab active:cursor-grabbing select-none ${selectedPlayers.has(player.name) ? "bg-blue-50" : "hover:bg-gray-50"}${tierDropRank === rank ? " border-t-2 border-t-blue-400" : ""}`}
                      >
                        <td className="px-4 py-3 w-24">
                          <div className="flex items-center gap-1" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                            <input
                              key={`${player.name}-${actualIndex}`}
                              type="number"
                              min="1"
                              max={currentPlayers.length}
                              defaultValue={actualIndex + 1}
                              onChange={(e) => {
                                const n = parseInt(e.target.value);
                                clearTimeout(rankEditTimerRef.current);
                                if (n > 0 && n <= currentPlayers.length) {
                                  rankEditTimerRef.current = setTimeout(() => movePlayerToRank(player.name, n), 800);
                                }
                              }}
                              className="w-[46px] border border-gray-200 rounded px-1 py-1 text-sm text-center bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                            />
                            <div className="flex flex-col gap-0">
                              <button
                                type="button"
                                onClick={() => { if (actualIndex > 0) movePlayerToRank(player.name, actualIndex); }}
                                className="flex items-center justify-center w-5 h-4 text-[10px] text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded leading-none"
                                title="Move up (better rank)"
                              >▲</button>
                              <button
                                type="button"
                                onClick={() => { if (actualIndex < currentPlayers.length - 1) movePlayerToRank(player.name, actualIndex + 2); }}
                                className="flex items-center justify-center w-5 h-4 text-[10px] text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded leading-none"
                                title="Move down (worse rank)"
                              >▼</button>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            <PlayerHeadshot espnId={player.pos === "DST" ? null : player.espn_id} sleeperId={player.pos === "DST" ? null : player.sleeper_id} name={player.name} size="xs" label={player.pos === "DST" ? player.team : null} />
                            {player.name}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-semibold ${posColors[player.pos] || "bg-gray-100 text-gray-500"}`}>
                            {rankingsPosRanks[player.name]}
                          </span>
                        </td>
                        <td className="hidden sm:table-cell px-4 py-3 text-gray-500">{player.team}</td>
                        <td className="px-4 py-3">
                          {confirmRemovePlayer === player.name ? (
                            <div className="flex flex-wrap items-center gap-1.5" onMouseDown={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); moveToUnranked(player.name); }}
                                className="text-xs bg-blue-500 hover:bg-blue-600 text-white font-medium px-2 py-0.5 rounded transition-colors whitespace-nowrap"
                              >Move to Unranked</button>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setConfirmRemovePlayer(null); }}
                                className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium px-2 py-0.5 rounded transition-colors"
                              >Cancel</button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-gray-300">⠿</span>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); setConfirmRemovePlayer(player.name); }}
                                onMouseDown={(e) => e.stopPropagation()}
                                className="opacity-0 group-hover:opacity-100 w-5 h-5 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center text-xs transition-all"
                                title="Remove player"
                              >×</button>
                            </div>
                          )}
                        </td>
                      </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>

            {!rankingsSearch.trim() && (
              <div className="mt-2 mb-4">
                <button
                  type="button"
                  onClick={() => { setShowAddTierModal(true); setAddTierRank(""); setAddTierError(""); }}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >+ Add Tier</button>
              </div>
            )}

            {/* Floating multi-select action bar */}
            {selectedPlayers.size > 0 && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-white rounded-xl shadow-2xl border border-gray-200 px-5 py-3 flex items-center gap-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                <span className="text-sm font-medium text-gray-700">{selectedPlayers.size} player{selectedPlayers.size !== 1 ? "s" : ""} selected</span>
                <button
                  type="button"
                  onClick={() => setBulkMoveConfirm(true)}
                  className="text-sm bg-blue-500 hover:bg-blue-600 text-white font-medium px-3 py-1.5 rounded-lg transition-colors"
                >Move to Unranked</button>
                <button
                  type="button"
                  onClick={() => { setSelectedPlayers(new Set()); setLastClickedPlayer(null); }}
                  className="text-sm bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium px-3 py-1.5 rounded-lg transition-colors"
                >Cancel</button>
              </div>
            )}

            {/* Import Excel modal */}
            {showImport && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center p-4"
                style={{ background: "rgba(0,0,0,0.4)" }}
                onClick={() => { setShowImport(false); setImportRows([]); setImportError(""); setImportSkipped([]); }}
              >
                <div
                  className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col"
                  onClick={e => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div>
                      <h2 className="text-lg font-bold text-[#0F172A]">
                        {importSkipped.length > 0 ? "Import complete" : "Import Rankings from Excel"}
                      </h2>
                      <p className="text-gray-400 text-sm mt-0.5">Format: {activeFormat}</p>
                    </div>
                    <button
                      onClick={() => { setShowImport(false); setImportRows([]); setImportError(""); setImportSkipped([]); }}
                      className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none"
                    >×</button>
                  </div>

                  {/* Body */}
                  <div className="flex-1 overflow-y-auto px-6 py-5">
                    <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-5">
                      <p className="font-medium text-blue-800 text-sm mb-1">Expected columns</p>
                      <p className="text-blue-600 font-mono text-xs">Rank · Name · Position · Team</p>
                      <p className="text-blue-500 text-xs mt-1.5">Rank determines order. Position: QB / RB / WR / TE. Team: NFL abbreviation (or FA). Accepts .xlsx, .xls, and .csv.</p>
                    </div>

                    <input
                      ref={importFileRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleImportFile}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => importFileRef.current?.click()}
                      className="w-full border-2 border-dashed border-gray-200 hover:border-blue-400 rounded-xl py-6 text-center text-gray-400 hover:text-blue-500 transition-colors text-sm font-medium mb-4"
                    >
                      Click to select file (.xlsx, .xls, .csv)
                    </button>

                    {importError && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                        {importError}
                      </div>
                    )}

                    {importSkipped.length > 0 && importRows.length === 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
                        <p className="font-semibold text-amber-800 text-sm mb-3">
                          {importSkipped.length} player{importSkipped.length !== 1 ? "s" : ""} in your file weren't found and were skipped:
                        </p>
                        <ul className="flex flex-col gap-1.5 mb-4">
                          {importSkipped.map((name, i) => (
                            <li key={i} className="text-amber-700 text-sm font-medium">{name}</li>
                          ))}
                        </ul>
                        <p className="text-amber-600 text-xs">Flag these names for an admin to add to the player database, then re-import your file.</p>
                      </div>
                    )}

                    {importRows.length > 0 && (() => {
                      const normalizeName = n => n.toLowerCase().replace(/\./g, " ").trim().replace(/\s+/g, " ");
                      const poolByNorm = Object.fromEntries(playerPool.map(p => [normalizeName(p.name), p]));
                      const unmatched = importRows.filter(r => !poolByNorm[normalizeName(r.name)]);
                      return (
                        <>
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-sm font-semibold text-[#0F172A]">{importRows.length} players parsed</p>
                            {unmatched.length > 0 && (
                              <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded-full font-medium">
                                {unmatched.length} not in player pool — will be skipped
                              </span>
                            )}
                          </div>
                          <div className="border border-gray-100 rounded-xl overflow-hidden">
                            <div className="overflow-x-auto">
                            <table className="w-full text-sm max-sm:[&_th]:px-2 max-sm:[&_th]:py-1.5 max-sm:[&_th]:text-[10px] max-sm:[&_td]:px-2 max-sm:[&_td]:py-1.5 max-sm:[&_td]:text-xs">
                              <thead className="bg-gray-50 text-gray-400 text-xs">
                                <tr>
                                  <th className="text-left px-3 py-2.5 w-12">Rank</th>
                                  <th className="text-left px-3 py-2.5">Name</th>
                                  <th className="text-left px-3 py-2.5">Pos</th>
                                  <th className="text-left px-3 py-2.5">Team</th>
                                </tr>
                              </thead>
                              <tbody>
                                {importRows.map((row, i) => {
                                  const inPool = !!poolByNorm[normalizeName(row.name)];
                                  return (
                                    <tr key={i} className="border-t border-gray-50 hover:bg-gray-50">
                                      <td className="px-3 py-2 text-gray-400 font-mono text-xs">{row.rank}</td>
                                      <td className="px-3 py-2 font-medium text-sm">
                                        {row.name}
                                        {!inPool && (
                                          <span className="ml-2 text-xs bg-amber-50 text-amber-600 border border-amber-200 px-1.5 py-0.5 rounded">skip</span>
                                        )}
                                      </td>
                                      <td className="px-3 py-2">
                                        <span className={`px-1.5 py-0.5 rounded text-xs font-semibold ${posColors[row.pos] || "bg-gray-100 text-gray-500"}`}>{row.pos || "—"}</span>
                                      </td>
                                      <td className="px-3 py-2 text-gray-500 text-xs">{row.team}</td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                            </div>
                          </div>
                        </>
                      );
                    })()}
                  </div>

                  {/* Footer */}
                  <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
                    {importSkipped.length > 0 && importRows.length === 0 ? (
                      <button
                        onClick={() => { setShowImport(false); setImportRows([]); setImportError(""); setImportSkipped([]); }}
                        className="ml-auto bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all"
                      >
                        Done
                      </button>
                    ) : (
                      <>
                        <button
                          onClick={() => { setShowImport(false); setImportRows([]); setImportError(""); setImportSkipped([]); }}
                          className="text-sm text-gray-500 hover:text-gray-700 font-medium transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={confirmImport}
                          disabled={importRows.length === 0 || importLoading}
                          className="bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-all disabled:opacity-40"
                        >
                          {importLoading ? "Importing..." : `Import ${importRows.length} players into ${activeFormat}`}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Copy Rankings overwrite confirmation */}
            {copyConfirm && (
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setCopyConfirm(null)}>
                <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
                  <h3 className="font-bold text-lg mb-2">Replace {activeFormat} rankings?</h3>
                  <p className="text-gray-500 text-sm mb-4">This will overwrite your current <span className="font-medium text-gray-700">{activeFormat}</span> rankings with a copy of <span className="font-medium text-gray-700">{copyConfirm.sourceFormat}</span>. Your changes won't be saved until you edit or drag a player.</p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => applyCopy(copyConfirm.sourceFormat)}
                      className="flex-1 bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-medium py-2 rounded-lg transition-all text-sm"
                    >Replace</button>
                    <button
                      type="button"
                      onClick={() => setCopyConfirm(null)}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium py-2 rounded-lg transition-colors text-sm"
                    >Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Add Tier modal */}
            {showAddTierModal && (
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowAddTierModal(false)}>
                <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
                  <h3 className="font-bold text-lg mb-1">Add Tier Break</h3>
                  <p className="text-gray-500 text-sm mb-4">Enter the rank after which the new tier should start.</p>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Insert tier after rank</label>
                  <input
                    type="number"
                    min="1"
                    value={addTierRank}
                    onChange={(e) => { setAddTierRank(e.target.value); setAddTierError(""); }}
                    onKeyDown={(e) => { if (e.key === "Enter") confirmAddTier(); if (e.key === "Escape") setShowAddTierModal(false); }}
                    placeholder="e.g. 24"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-1"
                    autoFocus
                  />
                  {addTierError && <p className="text-red-500 text-xs mb-3">{addTierError}</p>}
                  {!addTierError && <div className="mb-3" />}
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={confirmAddTier}
                      className="flex-1 bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-medium py-2 rounded-lg transition-all text-sm"
                    >Add Tier</button>
                    <button
                      type="button"
                      onClick={() => setShowAddTierModal(false)}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium py-2 rounded-lg transition-colors text-sm"
                    >Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Bulk move-to-unranked confirmation modal */}
            {bulkMoveConfirm && (
              <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 flex items-center justify-center" onClick={(e) => { e.stopPropagation(); setBulkMoveConfirm(false); }}>
                <div className="bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
                  <h3 className="font-bold text-lg mb-2">Move {selectedPlayers.size} player{selectedPlayers.size !== 1 ? "s" : ""} to Unranked?</h3>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => { bulkMoveToUnranked(); setBulkMoveConfirm(false); }}
                      className="flex-1 bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 rounded-lg transition-colors"
                    >Yes, move all</button>
                    <button
                      type="button"
                      onClick={() => setBulkMoveConfirm(false)}
                      className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-600 font-medium py-2 rounded-lg transition-colors"
                    >Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Floating buttons: quick-search + scroll-to-top */}
            {showFloatingSearch && (
              <div className="fixed inset-0 z-40" onClick={() => setShowFloatingSearch(false)} />
            )}
            <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2" onClick={(e) => e.stopPropagation()}>
              {showFloatingSearch && (
                <div className="bg-white/90 backdrop-blur-md border border-white/80 shadow-xl rounded-2xl p-3 w-72">
                  <input
                    autoFocus
                    type="text"
                    value={rankingsSearch}
                    onChange={(e) => setRankingsSearch(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") setShowFloatingSearch(false); }}
                    placeholder="Search players..."
                    className="w-full bg-white/60 border border-gray-200 rounded-xl px-3 py-2 text-sm text-[#0F172A] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {rankingsSearch.trim() && (
                    <p className="text-xs text-gray-400 mt-1.5 px-1">{filteredCurrentPlayers.length} match{filteredCurrentPlayers.length !== 1 ? "es" : ""}</p>
                  )}
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowFloatingSearch(prev => !prev)}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-full backdrop-blur-md border shadow-lg transition-all text-sm font-medium ${showFloatingSearch ? "bg-blue-600 border-blue-600 text-white hover:bg-blue-700" : "bg-white/80 border-white/80 text-gray-500 hover:text-gray-900 hover:bg-white"}`}
                  aria-label="Find player"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                  Find player
                </button>
                {showScrollTop && (
                  <button
                    type="button"
                    onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/80 backdrop-blur-md border border-white/80 shadow-lg text-gray-500 hover:text-gray-900 hover:bg-white transition-all text-sm font-medium"
                    aria-label="Scroll to top"
                  >
                    <svg width="16" height="16" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 12 9 6 15 12"/></svg>
                    Scroll to top
                  </button>
                )}
              </div>
            </div>

          </div>
        )}

        {/* ── My Auction Tab ── */}
        {tab === "auction" && (
          <AuctionRankingsEditor creatorId={profile.creator_id} />
        )}

        {/* ── My Waiver Wire Tab ── */}
        {tab === "waiver-wire" && (
          <WaiverWireEditor creatorId={profile.creator_id} />
        )}

        {/* ── Posts Tab ── */}
        {tab === "posts" && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Create post form */}
            <div>
              <h2 className="text-lg font-bold mb-4">New Post</h2>
              <form onSubmit={handleCreatePost} className="bg-white/70 backdrop-blur-md rounded-xl p-6 border border-white/80 shadow-lg flex flex-col gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Title</label>
                  <input
                    type="text"
                    value={postTitle}
                    onChange={(e) => setPostTitle(e.target.value)}
                    placeholder="Post title..."
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-[#0F172A] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>

                <div className="relative">
                  <label className="block text-sm text-gray-500 mb-1">Tag</label>
                  <input
                    type="text"
                    value={postTag}
                    onChange={(e) => setPostTag(e.target.value.slice(0, 30))}
                    onFocus={() => setTagDropdownOpen(true)}
                    onBlur={() => setTimeout(() => setTagDropdownOpen(false), 150)}
                    placeholder="Choose or type a tag…"
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-[#0F172A] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                  {tagDropdownOpen && (() => {
                    const normalised = postTag.trim().toLowerCase();
                    const usedTags = [...new Set([...TAGS, ...posts.map(p => p.tag).filter(Boolean)])];
                    const suggestions = usedTags.filter(t => !normalised || t.toLowerCase().includes(normalised));
                    if (!suggestions.length) return null;
                    return (
                      <ul className="absolute z-20 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden">
                        {suggestions.map(t => (
                          <li key={t}>
                            <button
                              type="button"
                              onMouseDown={() => { setPostTag(t); setTagDropdownOpen(false); }}
                              className="w-full text-left px-4 py-2 text-sm text-[#0F172A] hover:bg-blue-50 hover:text-blue-700"
                            >
                              {t}
                            </button>
                          </li>
                        ))}
                      </ul>
                    );
                  })()}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm text-gray-500">Content</label>
                    <div className="flex items-center gap-1">
                      {[
                        { label: "B", title: "Bold", action: () => applyInlineFormat("**", "**"), cls: "font-bold" },
                        { label: "I", title: "Italic", action: () => applyInlineFormat("*", "*"), cls: "italic" },
                        { label: "H", title: "Header", action: () => applyLinePrefix("# "), cls: "font-semibold" },
                      ].map(({ label, title, action, cls }) => (
                        <button
                          key={label}
                          type="button"
                          title={title}
                          onMouseDown={(e) => { e.preventDefault(); action(); }}
                          className={`w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:text-[#0F172A] hover:bg-gray-100 text-sm transition-colors ${cls}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <textarea
                    ref={contentRef}
                    value={postContent}
                    onChange={(e) => setPostContent(e.target.value)}
                    placeholder="Write your post…"
                    rows={5}
                    className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-[#0F172A] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none font-mono text-sm"
                    required
                  />
                </div>

                {/* File drop zone — drop auto-saves; click to attach up to 10 to a typed post */}
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                    Attachments (up to {MAX_POST_FILES}) — <span className="text-gray-400">drop files to publish instantly, or attach below</span>
                  </label>
                  <div
                    onDragOver={handleFileDragOver}
                    onDragLeave={handleFileDragLeave}
                    onDrop={handleFileDrop}
                    onClick={() => dropUploadStatus !== 'uploading' && fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-lg px-4 py-6 text-center transition-colors ${
                      dropUploadStatus === 'uploading'
                        ? "border-blue-400 bg-blue-50/60 cursor-wait"
                        : dropUploadStatus === 'success'
                        ? "border-green-400 bg-green-50/60 cursor-pointer"
                        : dropUploadStatus === 'error'
                        ? "border-red-400 bg-red-50/60 cursor-pointer"
                        : fileDragging
                        ? "border-blue-500 bg-blue-50/80 backdrop-blur-sm cursor-copy"
                        : "border-white/70 hover:border-blue-300 bg-white/40 backdrop-blur-sm cursor-pointer"
                    }`}
                  >
                    {dropUploadStatus === 'uploading' ? (
                      <p className="text-blue-600 text-sm font-medium">Uploading...</p>
                    ) : dropUploadStatus === 'success' ? (
                      <p className="text-green-600 text-sm font-medium">Saved!</p>
                    ) : dropUploadStatus === 'error' ? (
                      <div>
                        <p className="text-red-600 text-sm font-medium">Upload failed</p>
                        <p className="text-red-500 text-xs mt-1">{dropUploadError}</p>
                        <p className="text-gray-400 text-xs mt-2">Click to try again</p>
                      </div>
                    ) : postFiles.length > 0 ? (
                      <div className="flex flex-wrap items-center justify-center gap-2">
                        {postFiles.map((f, i) => (
                          <span
                            key={`${f.name}-${i}`}
                            className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-600 text-xs font-medium px-2 py-1 rounded"
                          >
                            {f.name}
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setPostFiles(prev => prev.filter((_, j) => j !== i)); }}
                              className="text-blue-400 hover:text-red-500"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                        {postFiles.length < MAX_POST_FILES && (
                          <span className="text-gray-400 text-xs">click to add more</span>
                        )}
                      </div>
                    ) : (
                      <p className="text-gray-400 text-sm">
                        Drop files to publish instantly, or <span className="text-blue-600">click to attach</span> to this post
                      </p>
                    )}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      const selected = Array.from(e.target.files || []);
                      if (selected.length === 0) return;
                      setPostFiles(prev => {
                        const combined = [...prev, ...selected];
                        if (combined.length > MAX_POST_FILES) {
                          setPostError(`You can attach up to ${MAX_POST_FILES} files — kept the first ${MAX_POST_FILES}.`);
                        }
                        return combined.slice(0, MAX_POST_FILES);
                      });
                      e.target.value = '';
                    }}
                  />
                </div>

                {postError && (
                  <p className="text-red-500 text-sm">{postError}</p>
                )}

                <button
                  type="submit"
                  disabled={postSaving}
                  className="bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold py-2.5 rounded-lg transition-all disabled:opacity-50"
                >
                  {postSaving ? "Publishing..." : "Publish Post"}
                </button>
              </form>
            </div>

            {/* Existing posts */}
            <div>
              <h2 className="text-lg font-bold mb-4">
                Published Posts <span className="text-gray-400 font-normal text-sm">({posts.length})</span>
              </h2>
              {posts.length === 0 ? (
                <div className="bg-white/70 backdrop-blur-md rounded-xl p-8 border border-white/80 shadow-lg text-center">
                  <p className="text-gray-400 text-sm">No posts yet. Create your first one.</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {posts.map((post) => (
                    <div key={post.id} className="bg-white/70 backdrop-blur-md rounded-xl p-4 border border-white/80 shadow-lg">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h3 className="font-semibold text-sm leading-tight">{post.title}</h3>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-medium">{post.tag}</span>
                          <button
                            onClick={() => handleDeletePost(post)}
                            disabled={deletingPostId === post.id}
                            className="text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40"
                            title="Delete post"
                          >
                            {deletingPostId === post.id ? (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                              </svg>
                            ) : (
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="text-gray-500 text-xs line-clamp-2 mb-2 [&_h1]:font-bold [&_h2]:font-bold [&_strong]:font-semibold [&_em]:italic">
                        <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{post.content}</ReactMarkdown>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-gray-400 text-xs">
                          {new Date(post.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </span>
                        {(() => {
                          const urls = post.file_urls?.length ? post.file_urls : (post.file_url ? [post.file_url] : []);
                          if (urls.length === 0) return null;
                          if (urls.length === 1) {
                            return (
                              <a href={urls[0]} target="_blank" rel="noopener noreferrer" className="text-blue-600 text-xs hover:text-blue-700">
                                📎 Attachment
                              </a>
                            );
                          }
                          return <span className="text-blue-600 text-xs">📎 {urls.length} attachments</span>;
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── My Earnings Tab ── */}
        {tab === "earnings" && (() => {
          const includedCount = creatorSubs.filter(s => s.plan_type !== "flat_access" && s.included_creator === profile.creator_id).length;
          const addonCount = creatorSubs.filter(s => {
            if (s.plan_type === "flat_access" || !s.add_on_creators) return false;
            const addons = Array.isArray(s.add_on_creators)
              ? s.add_on_creators
              : s.add_on_creators.split(",").filter(Boolean);
            return addons.includes(profile.creator_id);
          }).length;
          // promo_5mo subs use the same referral split as flat_access, but only count
          // in the calendar month they actually paid — it's a one-time charge, not
          // a recurring $10/mo, so it shouldn't show up as earnings for all 5 months.
          const promoPaidThisMonth = (s) => {
            const created = new Date(s.created_at);
            const now = new Date();
            return created.getFullYear() === now.getFullYear() && created.getMonth() === now.getMonth();
          };
          const flatCodedCount = creatorSubs.filter(s =>
            (s.plan_type === "flat_access" && s.referral_creator_id === profile.creator_id) ||
            (s.plan_type === "promo_5mo" && s.referral_creator_id === profile.creator_id && promoPaidThisMonth(s))
          ).length;
          const isCurrentlyActiveCreator = creatorActiveCreatorIds.includes(profile.creator_id);
          const flatSplitShare = isCurrentlyActiveCreator && creatorActiveCreatorIds.length > 0
            ? creatorSubs.filter(s =>
                (s.plan_type === "flat_access" && (!s.referral_creator_id || !creatorActiveCreatorIds.includes(s.referral_creator_id))) ||
                (s.plan_type === "promo_5mo" && (!s.referral_creator_id || !creatorActiveCreatorIds.includes(s.referral_creator_id)) && promoPaidThisMonth(s))
              ).length / creatorActiveCreatorIds.length
            : 0;
          const monthlyTotal = includedCount * 8 + addonCount * 4 + flatCodedCount * 8 + flatSplitShare * 10;
          const paidPayouts = creatorPayouts.filter(p => p.paid);

          return (
            <div>
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <label className="text-xs font-semibold text-gray-500">Period:</label>
                <select
                  value={earningsPeriod}
                  onChange={(e) => setEarningsPeriod(e.target.value)}
                  className="bg-white rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {REVENUE_PERIOD_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <div className="flex gap-1 ml-1">
                  {["usd", "cad"].map((c) => (
                    <button
                      key={c}
                      onClick={() => setRevenueCurrency(c)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold uppercase transition-colors ${
                        revenueCurrency === c ? "bg-[#2563EB] text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div className="bg-white/70 backdrop-blur-md border border-white/80 shadow-lg rounded-xl p-5 mb-8">
                {historicalPlatformRevenueLoading ? (
                  <p className="text-gray-400 text-sm">Loading real revenue history from Stripe...</p>
                ) : historicalPlatformRevenue?.error ? (
                  <p className="text-red-500 text-sm">{historicalPlatformRevenue.error}</p>
                ) : historicalPlatformRevenue ? (
                  <>
                    <p className="text-[#0F172A] text-sm font-medium mb-3">Platform-wide Revenue — {historicalPlatformRevenue.label}</p>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                      <div>
                        <p className="text-xl lg:text-2xl font-bold text-[#0F172A]">${historicalPlatformRevenue[revenueCurrency].totalRevenue.toLocaleString()}</p>
                        <p className="text-gray-500 text-xs mt-0.5">Gross Revenue</p>
                      </div>
                      <div>
                        <p className="text-xl lg:text-2xl font-bold text-red-500">-${historicalPlatformRevenue[revenueCurrency].stripeFees.toLocaleString()}</p>
                        <p className="text-gray-500 text-xs mt-0.5">Stripe Fees</p>
                      </div>
                      <div>
                        <p className="text-xl lg:text-2xl font-bold text-blue-600">${historicalPlatformRevenue[revenueCurrency].netRevenue.toLocaleString()}</p>
                        <p className="text-gray-500 text-xs mt-0.5">Net Revenue</p>
                      </div>
                    </div>
                    <p className="text-gray-400 text-xs">
                      {historicalPlatformRevenue.chargeCount} successful charge{historicalPlatformRevenue.chargeCount === 1 ? "" : "s"} · sourced live from Stripe
                      {revenueCurrency === "usd"
                        ? " (fees converted to USD at each charge's own settlement rate)"
                        : " (native CAD settlement amounts — exactly what Stripe pays out, no conversion)"}
                    </p>
                    {earningsPeriod !== "current" && (
                      <p className="text-gray-400 text-xs mt-3 max-w-md">
                        This is total revenue across the whole platform, not your personal cut — your earnings breakdown depends on which subscribers were tied to you at the time, which isn&apos;t tracked historically, so it&apos;s only available for the current month (shown below).
                      </p>
                    )}
                  </>
                ) : null}
              </div>

              {earningsPeriod === "current" && (
              <>
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-2 lg:gap-4 mb-8">
                <div className="bg-white/70 backdrop-blur-md border border-white/80 shadow-lg rounded-xl p-2 lg:p-5">
                  <p className="text-lg lg:text-3xl font-bold text-[#0F172A]">{includedCount}</p>
                  <p className="text-gray-700 text-[10px] lg:text-sm font-medium mt-0.5 lg:mt-1">Included subscribers</p>
                  <p className="hidden lg:block text-gray-400 text-xs mt-0.5">× $8/mo each</p>
                </div>
                <div className="bg-white/70 backdrop-blur-md border border-white/80 shadow-lg rounded-xl p-2 lg:p-5">
                  <p className="text-lg lg:text-3xl font-bold text-[#0F172A]">{addonCount}</p>
                  <p className="text-gray-700 text-[10px] lg:text-sm font-medium mt-0.5 lg:mt-1">Add-on subscribers</p>
                  <p className="hidden lg:block text-gray-400 text-xs mt-0.5">× $4/mo each</p>
                </div>
                <div className="bg-white/70 backdrop-blur-md border border-white/80 shadow-lg rounded-xl p-2 lg:p-5">
                  <p className={`text-lg lg:text-3xl font-bold ${monthlyTotal > 0 ? "text-blue-600" : "text-gray-300"}`}>
                    ${monthlyTotal}
                  </p>
                  <p className="text-gray-700 text-[10px] lg:text-sm font-medium mt-0.5 lg:mt-1">Monthly earnings</p>
                  <p className="hidden lg:block text-gray-400 text-xs mt-0.5">before platform fee</p>
                </div>
              </div>

              {/* Breakdown table */}
              <h2 className="text-lg font-bold mb-3">Earnings Breakdown</h2>
              <div className="bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg overflow-hidden mb-8">
                <div className="overflow-x-auto">
                <table className="w-full max-sm:[&_th]:px-2 max-sm:[&_th]:py-1.5 max-sm:[&_th]:text-[10px] max-sm:[&_td]:px-2 max-sm:[&_td]:py-1.5 max-sm:[&_td]:text-xs">
                  <thead className="bg-white/40 text-gray-500 text-sm">
                    <tr>
                      <th className="text-left px-4 py-3">Source</th>
                      <th className="text-left px-4 py-3">Subscribers</th>
                      <th className="text-left px-4 py-3">Rate</th>
                      <th className="text-left px-4 py-3">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-3 font-medium">Included plan</td>
                      <td className="px-4 py-3 font-mono">{includedCount}</td>
                      <td className="px-4 py-3 text-gray-500">$8/mo</td>
                      <td className="px-4 py-3 text-blue-600 font-semibold">${includedCount * 8}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-3 font-medium">Add-on</td>
                      <td className="px-4 py-3 font-mono">{addonCount}</td>
                      <td className="px-4 py-3 text-gray-500">$4/mo</td>
                      <td className="px-4 py-3 text-blue-600 font-semibold">${addonCount * 4}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-3 font-medium">Full access — your code</td>
                      <td className="px-4 py-3 font-mono">{flatCodedCount}</td>
                      <td className="px-4 py-3 text-gray-500">$8/mo</td>
                      <td className="px-4 py-3 text-blue-600 font-semibold">${flatCodedCount * 8}</td>
                    </tr>
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-3 font-medium">Full access — even split</td>
                      <td className="px-4 py-3 font-mono">{flatSplitShare.toFixed(2)} shares</td>
                      <td className="px-4 py-3 text-gray-500">$10/mo</td>
                      <td className="px-4 py-3 text-blue-600 font-semibold">${(flatSplitShare * 10).toFixed(2)}</td>
                    </tr>
                    <tr className="bg-gray-50">
                      <td className="px-4 py-3 font-bold">Total</td>
                      <td className="px-4 py-3 text-gray-500">—</td>
                      <td className="px-4 py-3 text-gray-500">—</td>
                      <td className="px-4 py-3 text-blue-600 font-bold text-lg">${monthlyTotal.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
                </div>
              </div>
              </>
              )}

              {/* Payout history */}
              <h2 className="text-lg font-bold mb-3">Payout History</h2>
              {paidPayouts.length === 0 ? (
                <div className="bg-white/70 backdrop-blur-md rounded-xl p-8 border border-white/80 shadow-lg text-center">
                  <p className="text-gray-400 text-sm">No payouts recorded yet.</p>
                </div>
              ) : (
                <div className="bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full max-sm:[&_th]:px-2 max-sm:[&_th]:py-1.5 max-sm:[&_th]:text-[10px] max-sm:[&_td]:px-2 max-sm:[&_td]:py-1.5 max-sm:[&_td]:text-xs">
                    <thead className="bg-white/40 text-gray-500 text-sm">
                      <tr>
                        <th className="text-left px-4 py-3">Period</th>
                        <th className="text-left px-4 py-3">Amount</th>
                        <th className="text-left px-4 py-3">Paid on</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paidPayouts.map(p => (
                        <tr key={p.id} className="border-b border-gray-100">
                          <td className="px-4 py-3 font-medium">{p.period}</td>
                          <td className="px-4 py-3 text-blue-600 font-semibold">${p.amount}</td>
                          <td className="px-4 py-3 text-gray-400 text-sm">
                            {new Date(p.paid_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── My Analytics Tab ── */}
        {tab === "analytics" && (() => {
          const now = new Date();
          const thisWeekStart = new Date(now);
          thisWeekStart.setDate(now.getDate() - 7);
          const twoWeeksAgo = new Date(now);
          twoWeeksAgo.setDate(now.getDate() - 14);

          const thisWeekViews = analyticsPageViews.filter(e => new Date(e.created_at) >= thisWeekStart).length;
          const lastWeekViews = analyticsPageViews.filter(e => {
            const d = new Date(e.created_at);
            return d >= twoWeeksAgo && d < thisWeekStart;
          }).length;
          const viewDelta = thisWeekViews - lastWeekViews;

          const playerClickCounts = {};
          for (const e of analyticsPlayerClicks) {
            playerClickCounts[e.player_id] = (playerClickCounts[e.player_id] || 0) + 1;
          }
          const top10 = Object.entries(playerClickCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 10);

          return (
            <div>
              <h2 className="text-lg font-bold mb-4">Page Views</h2>
              <div className="grid grid-cols-2 gap-2 lg:gap-4 mb-8">
                <div className="bg-white/70 backdrop-blur-md border border-white/80 shadow-lg rounded-xl p-3 lg:p-5">
                  <p className="text-xl lg:text-3xl font-bold text-blue-600">{thisWeekViews}</p>
                  <p className="text-gray-500 text-xs lg:text-sm mt-0.5 lg:mt-1">This week</p>
                  {viewDelta !== 0 && (
                    <p className={`text-[10px] lg:text-xs font-semibold mt-1 lg:mt-2 ${viewDelta > 0 ? "text-green-600" : "text-red-500"}`}>
                      {viewDelta > 0 ? "↑" : "↓"} {Math.abs(viewDelta)} vs last week
                    </p>
                  )}
                </div>
                <div className="bg-white/70 backdrop-blur-md border border-white/80 shadow-lg rounded-xl p-3 lg:p-5">
                  <p className="text-xl lg:text-3xl font-bold text-gray-400">{lastWeekViews}</p>
                  <p className="text-gray-500 text-xs lg:text-sm mt-0.5 lg:mt-1">Last week</p>
                </div>
              </div>

              <h2 className="text-lg font-bold mb-4">Most Clicked Players</h2>
              {top10.length === 0 ? (
                <div className="bg-white/70 backdrop-blur-md rounded-xl p-8 border border-white/80 shadow-lg text-center">
                  <p className="text-gray-400 text-sm">No player clicks recorded yet.</p>
                </div>
              ) : (
                <div className="bg-white/60 backdrop-blur-md rounded-xl border border-white/70 shadow-lg overflow-hidden">
                  <div className="overflow-x-auto">
                  <table className="w-full max-sm:[&_th]:px-2 max-sm:[&_th]:py-1.5 max-sm:[&_th]:text-[10px] max-sm:[&_td]:px-2 max-sm:[&_td]:py-1.5 max-sm:[&_td]:text-xs">
                    <thead className="bg-white/40 text-gray-500 text-sm">
                      <tr>
                        <th className="text-left px-4 py-3 w-10">#</th>
                        <th className="text-left px-4 py-3">Player</th>
                        <th className="text-left px-4 py-3">Clicks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {top10.map(([playerName, count], i) => (
                        <tr key={playerName} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-400 font-mono text-sm">{i + 1}</td>
                          <td className="px-4 py-3 font-medium">{playerName}</td>
                          <td className="px-4 py-3">
                            <span className="font-mono font-semibold text-blue-600">{count}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── My Profile Tab ── */}
        {tab === "profile" && (
          <div className="max-w-lg">
            <h2 className="text-lg font-bold mb-6">My Profile</h2>
            <div className="bg-white/70 backdrop-blur-md rounded-xl border border-white/80 shadow-lg p-6 flex flex-col gap-5">

              {/* Logo upload */}
              <div>
                <label className="block text-sm text-gray-500 mb-3">Logo / Profile Picture</label>
                <div className="flex items-center gap-4">
                  <CreatorAvatar
                    logoUrl={profile.logo_url}
                    initials={(profile.creator_id || "?").slice(0, 2).toUpperCase()}
                    colorClass="bg-blue-600"
                    size="lg"
                  />
                  <div className="flex-1">
                    <label className={`flex flex-col items-center justify-center border-2 border-dashed rounded-lg px-4 py-4 text-center cursor-pointer transition-colors ${logoUploading ? "border-blue-400 bg-blue-50/60 cursor-wait" : "border-gray-200 hover:border-blue-300 bg-gray-50"}`}>
                      <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        disabled={logoUploading}
                        onChange={(e) => { if (e.target.files?.[0]) { openCropModal(e.target.files[0]); e.target.value = ""; } }}
                      />
                      {logoUploading ? (
                        <span className="text-blue-600 text-sm font-medium">Uploading…</span>
                      ) : (
                        <>
                          <span className="text-gray-500 text-sm">{profile.logo_url ? "Replace logo" : "Upload logo"}</span>
                          <span className="text-gray-400 text-xs mt-0.5">PNG, JPG, SVG · max 5 MB</span>
                        </>
                      )}
                    </label>
                    {logoUploadError && <p className="text-red-500 text-xs mt-1">{logoUploadError}</p>}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-500 mb-1">Display Name</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="Your creator name"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-[#0F172A] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Handle</label>
                <input
                  type="text"
                  value={profileHandle}
                  onChange={(e) => setProfileHandle(e.target.value)}
                  placeholder="@yourhandle"
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-[#0F172A] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
                <p className="text-gray-400 text-xs mt-1">Shown on your public creator page.</p>
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">Bio</label>
                <textarea
                  value={profileBio}
                  onChange={(e) => setProfileBio(e.target.value)}
                  placeholder="Tell subscribers what you specialize in..."
                  rows={4}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-[#0F172A] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-500 mb-1">📌 Pinned Announcement <span className="text-gray-400">(shown at top of your community page)</span></label>
                <textarea
                  value={profileAnnouncement}
                  onChange={(e) => setProfileAnnouncement(e.target.value)}
                  placeholder="Pin a message to the top of your community page..."
                  rows={3}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 text-[#0F172A] focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                />
                <p className="text-gray-400 text-xs mt-1">Leave blank to hide the banner.</p>
              </div>
              <div className="flex items-center gap-4">
                <button
                  onClick={saveProfile}
                  disabled={profileSaving}
                  className="bg-gradient-to-br from-[#2563EB] to-[#1E40AF] hover:brightness-110 text-white font-bold px-6 py-2.5 rounded-lg transition-all disabled:opacity-50"
                >
                  {profileSaving ? "Saving..." : "Save Profile"}
                </button>
                {profileSaved && <span className="text-green-600 text-sm font-medium">✅ Saved!</span>}
                {profileSaveError && <span className="text-red-500 text-sm">{profileSaveError}</span>}
              </div>
            </div>
          </div>
        )}

          </div>
        </div>

      </div>
    </main>

    {/* ── Logo Crop Modal ── */}
    {cropSrc && (
      <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100">
            <h3 className="font-semibold text-[#0F172A]">Adjust Photo</h3>
            <p className="text-gray-400 text-xs mt-0.5">Drag to reposition · scroll or slide to zoom</p>
          </div>
          <div className="relative bg-gray-900" style={{ height: 300 }}>
            <Cropper
              image={cropSrc}
              crop={cropXY}
              zoom={cropZoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCropXY}
              onZoomChange={setCropZoom}
              onCropComplete={(_, pixels) => setCropArea(pixels)}
            />
          </div>
          <div className="px-5 py-3 flex items-center gap-3">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 shrink-0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
            <input
              type="range"
              min={1}
              max={3}
              step={0.05}
              value={cropZoom}
              onChange={e => setCropZoom(Number(e.target.value))}
              className="flex-1 accent-blue-600"
            />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-400 shrink-0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          </div>
          <div className="flex gap-3 px-5 pb-5">
            <button
              onClick={() => { setCropSrc(null); setLogoUploadError(""); }}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmCrop}
              disabled={logoUploading}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-br from-[#2563EB] to-[#1E40AF] text-white text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
            >
              {logoUploading ? "Saving…" : "Save Photo"}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
