import { xai } from '@ai-sdk/xai';
import { generateImage, experimental_generateVideo } from 'ai';
import fs from 'node:fs/promises';
import path from 'node:path';
import readlineSync from 'readline-sync';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.XAI_API_KEY;
if (!apiKey) {
	console.error('Error: XAI_API_KEY not found in .env');
	process.exit(1);
}

async function main() {
	const modeEnv = process.env.MODE?.trim().toLowerCase();
	let mode = modeEnv === 'video' ? 'video' : (modeEnv === 'image' ? 'image' : null);

	if (!mode) {
		const answer = readlineSync.question('Generate [i]mage or [v]ideo? (i/v): ').trim().toLowerCase();
		mode = answer === 'v' ? 'video' : 'image';
	}

	console.log(`\nMode: ${mode === 'video' ? 'Image-to-Video' : 'Image Generation'}`);

	const promptEnv = process.env.PROMPT?.trim();
	let prompt = promptEnv || readlineSync.question('Enter your prompt: ').trim();

	if (!prompt) {
		console.log('No prompt provided. Exiting.');
		return;
	}

	let imageSource = null;
	if (mode === 'video') {
		const sourceEnv = process.env.VIDEO_IMAGE_SOURCE?.trim();
		imageSource = sourceEnv || readlineSync.question('Path to source image (relative or absolute): ').trim();

		if (!imageSource) {
			console.log('No image source provided for video mode. Exiting.');
			return;
		}

		try {
			await fs.access(imageSource);
		} catch {
			console.log(`Cannot find file: ${imageSource}`);
			return;
		}
	}

	let n = 1;
	if (mode === 'image') {
		const nStr = process.env.COUNT?.trim() ||
			readlineSync.question('How many images? (default 1): ').trim() ||
			'1';
		n = parseInt(nStr, 10) || 1;
	}

	let duration = 3;
	if (mode === 'video') {
		const durEnv = process.env.DURATION?.trim();
		const durInput = durEnv ||
			readlineSync.question('Video duration in seconds (default 2): ').trim() ||
			'8';
		duration = parseInt(durInput, 10) || 2;
		if (duration < 1 || duration > 15) {
			console.log('Duration clamped to 2 seconds (typical model limit).');
			duration = 2;
		}
	}

	const aspectRatio = '9:16';

	console.log(`\nPreparing to generate with prompt: "${prompt}"`);
	if (mode === 'video') {
		console.log(`Using source image: ${imageSource}`);
		console.log(`Duration: ${duration}s`);
	} else {
		console.log(`Generating ${n} image(s)`);
	}
	console.log(`Aspect ratio: ${aspectRatio}`);

	const outputDir = path.join(process.cwd(), 'generated-images');
	await fs.mkdir(outputDir, { recursive: true });

	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

	try {
		if (mode === 'image') {
			const { images } = await generateImage({
				model: xai.image('grok-imagine-image'),
				prompt,
				n,
				aspectRatio,
			});

			for (let i = 0; i < images.length; i++) {
				const image = images[i];
				const extension = image.mimeType?.split('/')[1] || 'png';
				const filename = `grok-${timestamp}-${i + 1}.${extension}`;
				const filepath = path.join(outputDir, filename);

				await fs.writeFile(filepath, image.uint8Array);

				console.log(`Saved image: ${filepath}`);
			}

			console.log(`\nDone! ${images.length} image(s) saved to: ${outputDir}`);
		} else {
			console.log('Reading source image...');
			const imageBuffer = await fs.readFile(imageSource);
			const imageUint8 = new Uint8Array(imageBuffer);

			console.log('Generating video... (this may take longer)');
			const { video } = await experimental_generateVideo({
				model: xai.video('grok-imagine-video'),
				prompt: {
					text: prompt,
					image: imageUint8,
				},
				duration,
				aspectRatio,
			});

			let videoBuffer;
			if (video.uint8Array) {
				videoBuffer = video.uint8Array;
			} else if (video.url) {
				console.log('Downloading video from temporary URL...');
				const res = await fetch(video.url);
				if (!res.ok) throw new Error(`Failed to download: ${res.status}`);
				videoBuffer = new Uint8Array(await res.arrayBuffer());
			} else {
				throw new Error('No video data received');
			}

			const sourceBasename = path.basename(imageSource, path.extname(imageSource));
			const filename = `${sourceBasename}.mp4`;
			const filepath = path.join(outputDir, filename);

			await fs.writeFile(filepath, videoBuffer);

			console.log(`Saved video: ${filepath}`);
			if (video.url) {
				console.log(`(Temporary source URL was: ${video.url})`);
			}

			console.log(`\nDone! Video saved to: ${filepath}`);
		}
	} catch (error) {
		console.error('Generation failed:', error);

		if (error?.response) {
			console.error('HTTP status:     ', error.response.status);
			console.error('Status text:     ', error.response.statusText);
			console.error('Response headers:', error.response.headers);

			let body = '';
			try {
				body = await error.response.text();
			} catch { }
			console.error('Raw response body:', body);
		} else if (error?.message) {
			console.error('Error message:', error.message);
		}
	}
}

main().catch(console.error);