export interface ShotGuide {
  videoUrl: string;
  title: string;
  steps: string[];
  mistakes: string[];
  drills: string[];
}

const toSlug = (shot: string) => shot.toLowerCase().replace(/\s+/g, '-');

export const shotGuides: Record<string, ShotGuide> = {
  Forehand: {
    title: 'Forehand Topspin Fundamentals',
    videoUrl: 'https://www.youtube.com/embed/JYIwFtEjo7A',
    steps: [
      'Set feet shoulder-width apart with your body slightly side-on to the table.',
      'Relax the wrist and bring the bat back using your hips and shoulder rotation.',
      'Start the swing from your legs, driving upward and forward through the ball.',
      'Make contact slightly in front of your body while keeping your elbow relaxed.',
      'Finish with a smooth follow-through across your body and recover for the next shot.',
    ],
    mistakes: [
      'Over-swinging with the arm instead of using legs and core.',
      'Contacting the ball too late, causing it to float long.',
      'Locking the wrist, which removes spin and control.',
    ],
    drills: [
      '20 smooth forehands focusing only on timing and balance.',
      'Alternate forehand and backhand drives while keeping a steady rhythm.',
      'Gradually increase power while maintaining the same contact point and follow-through.',
    ],
  },
  Backhand: {
    title: 'Backhand Drive Technique',
    videoUrl: 'https://www.youtube.com/embed/tEH8qwOBxaA',
    steps: [
      'Adopt a neutral stance with weight balanced on the balls of your feet.',
      'Keep the elbow close to the body and draw the bat back no more than 15 cm.',
      'Push from your legs and rotate the forearm forward to meet the ball early.',
      'Maintain a firm but relaxed wrist to brush over the ball for topspin.',
      'Finish high with the bat pointing where you want the ball to travel.',
    ],
    mistakes: [
      'Standing up tall instead of staying low and balanced.',
      'Letting the backswing travel too far behind the body.',
      'Hitting with only the wrist, which kills stability.',
    ],
    drills: [
      '15 controlled cross-table backhands focusing on clean contact.',
      'Continuous backhand-to-backhand rally movement at a relaxed pace.',
      'Add spin by accelerating the forearm while keeping the stroke compact.',
    ],
  },
  Smash: {
    title: 'Smash for Finishing Points',
    videoUrl: 'https://www.youtube.com/embed/ji9qtG2-In8',
    steps: [
      'Read the high ball early and move your feet to position behind it.',
      'Take the bat back with a compact backswing and load your shoulder.',
      'Explode upward, leading with your elbow and snapping the wrist at impact.',
      'Contact the ball at the highest comfortable point to maximize leverage.',
      'Recover balance quickly to be ready for any return.',
    ],
    mistakes: [
      'Waiting flat-footed so the ball drops too low.',
      'Swinging wildly without keeping the elbow leading.',
      'Forgetting to recover, leaving the table wide open.',
    ],
    drills: [
      'Shadow swing 15 smashes with full extension and balanced recovery.',
      'Alternate slow and fast smashes to learn tempo control.',
      'Smash to specific zones on the table for placement accuracy.',
    ],
  },
  Push: {
    title: 'Controlled Push Rally',
    videoUrl: 'https://www.youtube.com/embed/mpe5ELawdYk',
    steps: [
      'Stay low with a wide base and keep the wrist firm.',
      'Angle the bat slightly open and meet the ball on the rise.',
      'Use a short forward motion from the forearm, guiding the ball low over the net.',
      'Adjust bat angle to manage incoming spin and maintain placement depth.',
      'Finish by returning to neutral stance ready for the next ball.',
    ],
    mistakes: [
      'Stabbing forward with too much elbow, sending the ball long.',
      'Letting the wrist collapse and gifting pop-ups.',
      'Standing up mid-rally and losing balance.',
    ],
    drills: [
      'Play 20 short backspin pushes that bounce twice on the opponent’s side.',
      'Alternate long and short pushes to disrupt rhythm while staying low.',
      'Pick a small target area and aim every push into that zone.',
    ],
  },
  Block: {
    title: 'Quick Reaction Block',
    videoUrl: 'https://www.youtube.com/embed/D1dkJ6efoPI',
    steps: [
      'Stand close to the table with compact, relaxed grip.',
      'Meet the opponent’s topspin early with a perpendicular bat angle.',
      'Absorb pace by softening the wrist or redirect by closing the angle.',
      'Keep the stroke short—just guide the ball rather than swing.',
      'Recover instantly since the rally will stay fast.',
    ],
    mistakes: [
      'Taking a backswing, which makes you late to the ball.',
      'Letting the wrist tighten so the ball shoots up.',
      'Leaning backward and losing control of the table.',
    ],
    drills: [
      'Passive blocking drill: absorb your partner’s topspin without adding pace.',
      'Active blocks with a small wrist lift to redirect the ball.',
      'Random placement blocking, reacting to balls to forehand and backhand.',
    ],
  },
  Flick: {
    title: 'Attacking Flick Receive',
    videoUrl: 'https://www.youtube.com/embed/zX3i4G3LU40',
    steps: [
      'Step in with your playing foot under the table while keeping balance.',
      'Open the wrist and keep the backswing short to disguise direction.',
      'Brush up sharply on the ball, using fingers to accelerate the racket.',
      'Aim to contact on top of the bounce to steal time from the opponent.',
      'Recover by hopping back to neutral stance immediately.',
    ],
    mistakes: [
      'Waiting on the heels so you can’t reach the short ball.',
      'Swinging from the shoulder instead of snapping with fingers.',
      'Contacting too late and driving the ball into the net.',
    ],
    drills: [
      'Perform 10 slow-motion flicks focusing purely on timing and contact point.',
      'Flick to wide angles on the opponent’s side to practice placement.',
      'Gradually increase wrist speed while keeping balance and low stance.',
    ],
  },
  Serve: {
    title: 'Spin-Heavy Serve Routine',
    videoUrl: 'https://www.youtube.com/embed/Qp0DH9jV0Fw',
    steps: [
      'Toss the ball consistently to keep your motion legal and repeatable.',
      'Accelerate the wrist into the ball while brushing for spin.',
      'Vary contact point on the rubber to mix sidespin and topspin/backspin.',
      'Land the first bounce close to the net to keep serves low.',
      'Recover with ready position in case the serve is returned aggressively.',
    ],
    mistakes: [
      'Changing toss height each serve, making it unreadable for you too.',
      'Striking flat with no variation in spin.',
      'Watching the serve instead of resetting to ready position.',
    ],
    drills: [
      'Serve 20 short serves that land close to the net and stay low.',
      'Alternate heavy backspin and topspin serves to feel spin variation.',
      'Aim serves to deep corners, focusing on both spin and placement.',
    ],
  },
  Chop: {
    title: 'Defensive Chop Basics',
    videoUrl: 'https://www.youtube.com/embed/j0-iRBZPs_0',
    steps: [
      'Retreat a step from the table and lower your center of gravity.',
      'Take the racket high and slice down the back of the ball with relaxed wrist.',
      'Use forearm and wrist to adjust spin—more acceleration equals heavier backspin.',
      'Aim for deep placement to force the opponent to lift the next ball.',
      'Glide back to ready stance to handle follow-up shots.',
    ],
    mistakes: [
      'Standing upright so you can’t absorb the opponent’s power.',
      'Hacking straight down instead of brushing through the ball.',
      'Leaving chops short so the opponent attacks easily.',
    ],
    drills: [
      'Play 20 controlled chops that land deep on the opponent’s side.',
      'Move one step back from the table and practise mid-distance defensive chops.',
      'Random movement drill: alternate chopping to forehand and backhand corners.',
    ],
  },
};

const slugToShotMap = Object.keys(shotGuides).reduce<Record<string, string>>((acc, shot) => {
  acc[toSlug(shot)] = shot;
  return acc;
}, {});

export function toShotSlug(shot: string) {
  return toSlug(shot);
}

export function resolveShotName(param?: string | null) {
  if (!param) return null;
  const normalized = param.toLowerCase();
  return slugToShotMap[normalized] ?? null;
}

export const shotGuideEntries = Object.entries(shotGuides).map(([name, guide]) => ({
  name,
  slug: toShotSlug(name),
  guide,
}));
