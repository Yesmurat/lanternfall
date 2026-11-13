// The lantern-bearer's history, one piece per floor.
//
// Every floor hides one inscription. Reading it unlocks that entry for good:
// it is kept apart from the run save, so dying or abandoning a run loses nothing,
// and the journal on the title screen fills in over many descents.
//
// All of the story's words live in this file. Edit them freely; nothing else in
// the game depends on what they say, only on there being one entry per floor.

import { FINAL_DEPTH } from './data.js';

const STORY_KEY = 'lanternfall.story.v1';

// BEATS[depth] is the inscription found on that floor.

export const BEATS = [
	null,

	// ---- I. The way down
	{
		title: 'Forty-One Steps',
		text: 'Forty-one steps from the last landing to the Spill. You did not count them. Your feet did. Cut into the lintel, worn almost flat by hands: MIND THE LAMPS, MIND EACH OTHER. You touched it every morning on your way up to fetch water, and you have just touched it again without deciding to.',
	},
	{
		title: 'Low Water',
		text: 'A row of names scratched at child height along the cistern wall, each with a line for how far its owner could swim. Yours is the fourth from the left. The line beside it is the longest but one. Someone has since cut above it, in a careful adult hand: STILL OURS.',
	},
	{
		title: 'The Rota',
		text: 'The ferry post still carries the tenders’ rota, burned into a plank: who trims, who pours, who walks the dark end with the long pole. Your mother’s mark heads every column. She was Keeper of the Everflame for thirty years and never once put herself on the easy shift.',
	},
	{
		title: 'Full Lamps',
		text: 'The stalls were left mid-morning. Scales still loaded, a knot half tied. And every lamp on every hook is full to the collar with oil. You tilt one to be sure. They did not run dry down here. The oil is all still waiting. It was the light that went, all at once, like a word taken back.',
	},
	{
		title: 'The New Row',
		text: 'The old dead lie in their niches with a wick laid across the chest, as tenders are. Then the niches stop and there is a new row, cut in a hurry, shallow, the chisel marks still white. You know the names. The baker. The ferryman’s two girls. Your teacher. Every date is the same season: the first winter of the dark.',
	},

	// ---- II. Home
	{
		title: 'The Fourth Door',
		text: 'Fourth door on Lampwrights’ Row. The step is hollowed where you sat to pull your boots on. Above the latch your height is notched into the frame, year on year, and the notches stop at a child’s shoulder. Nobody ever cut the next one. Nobody painted over them either.',
	},
	{
		title: 'First Rule',
		text: 'Over the press-house door, in letters a hand deep, the first rule, the one you could recite before you could read: NO FLAME LEAVES THE HALL. Light a lamp from a lamp from a lamp, and carry that. The Everflame itself is not a thing you take from. It is a thing you stand beside.',
	},
	{
		title: 'Sky',
		text: 'In the loft where the apprentices slept, the underside of one bunk is covered in drawings. A stair that goes up and does not stop. A round lamp hung in nothing, which the pedlars called the sun. Under it, in a child’s square letters: I WILL SEE IT. You remember the nail you used.',
	},
	{
		title: 'A Note Home',
		text: 'A slate, still on its hook, in your teacher’s hand. “Bright. Quick with a wick. Asks every week how many steps there are to the top, and will not take I don’t know for an answer. I have told the Keeper the child is not restless. The child is leaving, slowly, and has been since it could walk.”',
	},
	{
		title: 'The Naming',
		text: 'The Keepers’ names run round the hall in a band of bronze, each set there by the one before. The last plate is your mother’s. Beside it a plate has been fixed and left blank, and it is bright: someone kept polishing it. You were eleven when she showed you where your name would go. You said you would rather die. You remember her not arguing.',
	},

	// ---- III. The night
	{
		title: 'What You Say',
		text: 'Here is what you have always said. You climbed out as a child, alone, by rushlight, because you wanted the sky. Years later word came up the stair that the Everflame had failed, and the deep with it, long after you were gone. You have told it so often that it has worn smooth. Scratched in the Sump wall, by someone who waited here: IT DID NOT FAIL.',
	},
	{
		title: 'The Watch Book',
		text: 'The watch book lay open in the stacks, and the damp has spared one page. “Last bell. Flame steady, three hands high, colour good. Keeper’s child seen in the hall after hours again. Sent home.” It is the final entry. There is no entry for the night the flame failed, because there was no night after this one. You know the date. It is the night you left.',
	},
	{
		title: 'Witness',
		text: 'Cut into the choir rail, crooked, by someone working in the dark. “I saw it. I was in the loft and I saw a child at the Everflame with a lantern, an unlit one, holding it up the way you hold a cup to a spring. I thought: that is the Keeper’s child, it is allowed. Then the hall went black and I heard small feet on the stair.”',
	},
	{
		title: 'The Keeper’s Order',
		text: 'Your mother’s hand, on the gallery wall, large enough to be read by a single candle. “No one is to follow. No one is to bring the child back. I will not have it said down here that we hunted one of our own up the stair. We tended a light for a thousand years. Let it be worth one child seeing the sky.” Under it, smaller: “It was mine to watch. Not theirs. Mine.”',
	},
	{
		title: 'The Vigil',
		text: 'They did not all leave. Some stayed in this hall and kept the watch as though there were something to watch. The rota is chalked on the floor, years of it, the names thinning out. The last column has only one mark in it, over and over, down to the foot of the wall. Your mother kept the vigil alone, for a light she had forbidden anyone to fetch.',
	},

	// ---- IV. The truth
	{
		title: 'The Cup and the Spring',
		text: 'At Gloamgate you remember it, all of it, as if the stone had been holding it for you. The hall empty. The flame three hands high. Your lantern, new, your own work, with no light in it. You did not light it from a lamp from a lamp. You held it up to the heart of the Everflame, and the flame came into it the way a held breath goes out. Then you ran.',
	},
	{
		title: 'What Is Left',
		text: 'A flame that is shared grows. A flame that is taken whole goes with the taker; every tender’s child is told so and none believes it. What you left on the hearth was the shape of a fire with no fire in it. It has had years to learn to walk. It hates lamps the way a socket hates the eye. The cold on this stair is not weather. It is the Snuffer, and you made it.',
	},
	{
		title: 'The Lantern',
		text: 'You have never once struck a spark for this lantern. You have fed it oil in a hundred lodging houses and never asked why it took no lighting, why it throws further than its glass should allow, why the dark leans away. It is not a lantern. It is the Everflame, the whole of it, burning small in a tin you soldered yourself, and you have carried it past every door in this place.',
	},
	{
		title: 'For My Child',
		text: 'The last words on the Keeper’s Walk are low on the wall, where someone sitting would cut them. “You will come back down. I know it as I know my own hands. When you do, do not be afraid of what is in the hall; it is only where the fire was. Put the fire back. I am not angry. I was never angry. I polished your plate. The post is yours, if you can bear to stay.”',
	},
	{
		title: 'The Oath',
		text: 'Round the cold hearth, the oath every Keeper has spoken, cut by the first of them: I WILL NOT LEAVE IT. I WILL NOT LET IT LEAVE. I WILL STAND BESIDE IT UNTIL ANOTHER STANDS IN MY PLACE. Your mother stood here until she could not. There is nobody left to hear you say it. Say it anyway.',
	},
];

// Shown on the winning screen, and kept in the journal once earned.
export const EPILOGUE = {
	title: 'The Keeper',
	text: 'You open the lantern and pour the flame back where you took it from. It goes in small and comes up three hands high, and the colour is good. Light climbs the stair behind you, hall by hall, and far above, people who have never heard of you will find their lamps catch at the first try. You hang the empty lantern on its hook. You fix your name to the plate your mother polished. You do not go up again. Someone has to stand beside it.',
};

// One closing line per act, for a run that ends before the bottom.

const DEATH_LINES = [
	'The dark closes over the place where you stood. Below you, halls you half remember go on waiting.',
	'You fall within sight of your own street. The door with your height cut into its frame stays shut.',
	'You fall with the question still open: what happened the night the flame went out, and why you flinch from knowing.',
	'You fall knowing what you carry. The lantern rolls away still burning, and the thing in the hall goes on being cold.',
];

export const ACT_NAMES = ['The way down', 'Home', 'The night', 'The truth'];

export function actOf(depth) {

	return Math.max(0, Math.min(ACT_NAMES.length - 1, Math.floor((depth - 1) / 5)));

}

export function deathLine(depth) {

	return DEATH_LINES[actOf(depth)];

}

// ---------------------------------------------------------------- what has been read
//
// Ids are the floor number, or 'epilogue'. Storage can be missing (a private
// window, a blocked frame); then the story simply does not carry over.

export function unlocked() {

	try {
		const list = JSON.parse(localStorage.getItem(STORY_KEY) || '[]');

		return new Set(Array.isArray(list) ? list : []);
	}

	catch (e) {
		return new Set();
	}

}

// true if this is the first time the entry has been read
export function unlock(id) {

	const have = unlocked();

	if (have.has(id)) {
		return false;
	}

	have.add(id);

	try {
		localStorage.setItem(STORY_KEY, JSON.stringify([...have]));
	}

	catch (e) { /* nowhere to keep it; it still counts as new this time */ }

	return true;

}

export function readCount() {

	const have = unlocked();
	let n      = 0;

	for (let d = 1; d <= FINAL_DEPTH; d++) {

		if (have.has(d)) {
			n += 1;
		}

	}

	return n;

}
