import { Location } from '../types';

export interface RutPhase {
  name: string;
  phaseId: 'summer' | 'early' | 'pre_rut' | 'peak_rut' | 'lockdown' | 'post_rut' | 'late';
  emoji: string;
  iconName: string;
  badgeStyle: string;
  description: string;
  hunterTip: string;
}

/**
 * Calculates the deer rut phase based on the date of year and geographical region.
 * Designed to accurately shift dates depending on latitude and specific state traits (e.g. Texas vs Southern Ontario).
 */
export function getRutPhase(dateStr: string, location?: Location): RutPhase {
  let month = 11; // default to Nov
  let day = 5;
  if (dateStr) {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      month = parseInt(parts[1], 10);
      day = parseInt(parts[2], 10);
    } else {
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        month = d.getMonth() + 1;
        day = d.getDate();
      }
    }
  }

  const lat = location?.latitude ?? 43.0731; // Default to northern midwest (Madison, WI)
  const state = (location?.admin1 ?? '').toLowerCase();

  // Determine Zone: north, south, or mid
  let zone: 'north' | 'south' | 'mid' = 'mid';

  const southernStates = ['texas', 'louisiana', 'mississippi', 'alabama', 'florida', 'georgia', 'south carolina'];
  const northernStates = [
    'ontario', 'wisconsin', 'michigan', 'ohio', 'indiana', 'illinois', 'iowa', 'minnesota',
    'north dakota', 'south dakota', 'nebraska', 'new york', 'pennsylvania', 'maine', 'vermont',
    'new hampshire', 'massachusetts', 'connecticut', 'rhode island', 'new jersey', 'delaware',
    'maryland', 'west virginia', 'kentucky', 'missouri', 'kansas', 'colorado', 'utah', 'wyoming',
    'montana', 'idaho', 'oregon', 'washington', 'alberta', 'saskatchewan', 'manitoba', 'quebec',
    'new brunswick', 'nova scotia'
  ];

  if (southernStates.includes(state) || lat < 34) {
    zone = 'south';
  } else if (northernStates.includes(state) || lat >= 38) {
    zone = 'north';
  }

  // Calculate standard lookup value (Month * 100 + Day)
  const md = month * 100 + day; // e.g. Nov 5 = 1105, Oct 25 = 1025

  if (zone === 'north') {
    // Northern Tier / Southern Ontario / Midwest Timing (Rapid hard freeze & synchronized rut)
    if (md >= 301 && md <= 831) {
      return {
        name: 'Quiet Summer',
        phaseId: 'summer',
        emoji: '🌳',
        iconName: 'Trees',
        badgeStyle: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/35',
        description: 'Quiet Velvet Pattern',
        hunterTip: "Bucks are taking it easy in bachelor groups, growing their fuzzy velvet antlers and filling up on soybeans. Sit on a high-protein field edge in the evening and don't spook them!"
      };
    } else if (md >= 901 && md <= 1009) {
      return {
        name: 'Early Season',
        phaseId: 'early',
        emoji: '🦌',
        iconName: 'Compass',
        badgeStyle: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/35',
        description: 'Green Food & Bedding Shift',
        hunterTip: "Bachelor groups are breaking up and velvet is shedding. Bucks are still on highly predictable bed-to-food patterns. Target early dropping acorns or green clover plots."
      };
    } else if (md >= 1010 && md <= 1025) {
      return {
        name: 'Pre-Rut',
        phaseId: 'pre_rut',
        emoji: '🪵',
        iconName: 'Sparkles',
        badgeStyle: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/35',
        description: 'Scraping & Sparring Phase',
        hunterTip: "Bucks are feeling the testosterone surge! Scrape lines are popping up overnight and sparring is common. Time to hang mock scrapes, mock-lick branches, and use light buck grunts."
      };
    } else if (md >= 1026 && md <= 1109) {
      return {
        name: 'Peak Rut Chasing',
        phaseId: 'peak_rut',
        emoji: '🔥',
        iconName: 'Flame',
        badgeStyle: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/35',
        description: 'The Seeking & Chasing Frenzy',
        hunterTip: "Absolute visual chaos! Estrous does have bucks running on pure adrenaline in broad daylight. Do not leave the woods—sit all day near downwind funnel routes or thick doe bedding."
      };
    } else if (md >= 1110 && md <= 1120) {
      return {
        name: 'Lockdown Phase',
        phaseId: 'lockdown',
        emoji: '🔒',
        iconName: 'Lock',
        badgeStyle: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/35',
        description: 'Doe Lockdown Phase',
        hunterTip: "The woods can seem dead. Bucks have paired up and are tucked away with hot does in dense brush for 24-48 hours. Focus on tight bedding pinch points or wait for a buck transitioning between does."
      };
    } else if (md >= 1121 && md <= 1210) {
      return {
        name: 'Post-Rut',
        phaseId: 'post_rut',
        emoji: '🩹',
        iconName: 'ShieldCheck',
        badgeStyle: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/35',
        description: 'Secondary Doe Search',
        hunterTip: "Bucks are tired but looking to recover. A second wave of breeding occurs for late-developing fawns or unbred does. Focus on primary travel corridors near high-calorie food."
      };
    } else {
      // Dec 11 to Feb 28
      return {
        name: 'Late Season',
        phaseId: 'late',
        emoji: '❄️',
        iconName: 'Snowflake',
        badgeStyle: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/35',
        description: 'Severe Winter Bed-to-Feed',
        hunterTip: "Cold is king and deer need heavy calories. Bucks are worn thin and focused strictly on survival. Target standing corn, soy, or brassicas near southwest-facing bedding slopes."
      };
    }
  } else if (zone === 'south') {
    // Southern Tier / Texas Timing (starts later, longer breeding windows)
    if (md >= 301 && md <= 930) {
      return {
        name: 'Quiet Summer',
        phaseId: 'summer',
        emoji: '🌳',
        iconName: 'Trees',
        badgeStyle: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/35',
        description: 'Quiet Velvet Phase',
        hunterTip: "Warm weather has deer lying low in the shade. Bucks are packing on protein to grow giant antlers. Check shaded water holes and deep mesquite draw pathways."
      };
    } else if (md >= 1001 && md <= 1031) {
      return {
        name: 'Early Season',
        phaseId: 'early',
        emoji: '🦌',
        iconName: 'Compass',
        badgeStyle: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/35',
        description: 'Early Feeder & Oak Patterns',
        hunterTip: "Shedding velvet and establishing social status. Deer are hitting feeders or fresh drops of live oak acorns. Keep your wind correct on these sensitive trails."
      };
    } else if (md >= 1101 && md <= 1124) {
      return {
        name: 'Pre-Rut',
        phaseId: 'pre_rut',
        emoji: '🪵',
        iconName: 'Sparkles',
        badgeStyle: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/35',
        description: 'Scraping & Sparring Phase',
        hunterTip: "Scrapes and rubs are popping up overnight in the brush. Bucks are making their presence known. Get aggressive with mock scrapes and mid-day rattling calls."
      };
    } else if (md >= 1125 && md <= 1215) {
      return {
        name: 'Peak Rut Chasing',
        phaseId: 'peak_rut',
        emoji: '🔥',
        iconName: 'Flame',
        badgeStyle: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/35',
        description: 'The Southern Chase is ON!',
        hunterTip: "The main event! Bucks are actively searching for hot does through the brush and mesquite. Loud horn rattling is highly effective right now to pull a dominant buck into view."
      };
    } else if (md >= 1216 && md <= 1230) {
      return {
        name: 'Lockdown Phase',
        phaseId: 'lockdown',
        emoji: '🔒',
        iconName: 'Lock',
        badgeStyle: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/35',
        description: 'Brush Lockdown Phase',
        hunterTip: "Mature bucks are locked down with receptive does in dense sendero brush. Hunt the edges of extremely thick bedding cover where a buck might stand up to herd his doe."
      };
    } else if (md >= 1231 && md <= 115) {
      // Dec 31 to Jan 15
      return {
        name: 'Post-Rut',
        phaseId: 'post_rut',
        emoji: '🩹',
        iconName: 'ShieldCheck',
        badgeStyle: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/35',
        description: 'Secondary Buck Seek',
        hunterTip: "Mature bucks are exhausted but younger does and fawns are hitting their first cycle, sparking secondary chases. Hunt doe-rich zones and supplemental feed sources."
      };
    } else {
      // Jan 16 to Feb 28
      return {
        name: 'Late Season',
        phaseId: 'late',
        emoji: '❄️',
        iconName: 'Snowflake',
        badgeStyle: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/35',
        description: 'Late Winter Food Patterns',
        hunterTip: "Brutal winter stress means deer are focused completely on supplemental high-carb feed or remaining winter greens. Target feeders or native browse close to thick bedding."
      };
    }
  } else {
    // Transition / Mid-Latitude (Tennessee, NC, Oklahoma, Arkansas, Virginia, etc.)
    if (md >= 301 && md <= 831) {
      return {
        name: 'Quiet Summer',
        phaseId: 'summer',
        emoji: '🌳',
        iconName: 'Trees',
        badgeStyle: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/35',
        description: 'Quiet Velvet Phase',
        hunterTip: "Deer are staying cool and growing velvet. Focus on late afternoon agricultural feeding fields like alfalfa, clover, or mineral spots where legal."
      };
    } else if (md >= 901 && md <= 1005) {
      return {
        name: 'Early Season',
        phaseId: 'early',
        emoji: '🦌',
        iconName: 'Compass',
        badgeStyle: 'bg-teal-500/15 text-teal-600 dark:text-teal-400 border-teal-500/35',
        description: 'Predictable Bed-to-Feed Patterns',
        hunterTip: "Bachelor groups are shifting to hardwood timber as white oak acorns begin to drop. Target these high-attraction oak trees on the transitions to bedding cover."
      };
    } else if (md >= 1006 && md <= 1028) {
      return {
        name: 'Pre-Rut',
        phaseId: 'pre_rut',
        emoji: '🪵',
        iconName: 'Sparkles',
        badgeStyle: 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/35',
        description: 'Scraping & Rubbing Phase',
        hunterTip: "Pre-rut is heating up! Bucks are tearing up scrape lines along timber edges. Set up camera traps on active scrapes and try light rattling and soft contact grunts."
      };
    } else if (md >= 1029 && md <= 1113) {
      return {
        name: 'Peak Rut Chasing',
        phaseId: 'peak_rut',
        emoji: '🔥',
        iconName: 'Flame',
        badgeStyle: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/35',
        description: 'Crucial Seeking & Chasing',
        hunterTip: "Prime time! Bucks are actively seeking out receptive does across ridges and draws. Set your stand near active travel corridors, ridges, and doe feeding hotspots."
      };
    } else if (md >= 1114 && md <= 1124) {
      return {
        name: 'Lockdown Phase',
        phaseId: 'lockdown',
        emoji: '🔒',
        iconName: 'Lock',
        badgeStyle: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/35',
        description: 'Doe Lockdown Phase',
        hunterTip: "The woods can feel very quiet today as bucks lock down with does in thick cover. Set up on transition funnels between bedding thickets and be patient—the wait is worth it."
      };
    } else if (md >= 1125 && md <= 1212) {
      return {
        name: 'Post-Rut',
        phaseId: 'post_rut',
        emoji: '🩹',
        iconName: 'ShieldCheck',
        badgeStyle: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/35',
        description: 'Secondary Rut Chasing',
        hunterTip: "A secondary mini-rut will trigger for any unbred does. Tired bucks will travel travel-corridors. Focus on remaining soft mast, white oak acorns, or crop fields."
      };
    } else {
      // Dec 13 to Feb 28
      return {
        name: 'Late Season',
        phaseId: 'late',
        emoji: '❄️',
        iconName: 'Snowflake',
        badgeStyle: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/35',
        description: 'Late Winter Bed-to-Feed Patterns',
        hunterTip: "With cold air moving in, focus is strictly on food. Deer are in survival mode, moving from thick security bedding to grain sources. Find the active feed and you'll find the deer."
      };
    }
  }
}
