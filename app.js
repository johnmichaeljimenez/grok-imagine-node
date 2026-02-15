import { xai } from '@ai-sdk/xai';
import { generateImage } from 'ai';
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
	const prompt = process.env.PROMPT
		? process.env.PROMPT.trim()
		: readlineSync.question('Enter your image prompt: ').trim();

	if (!prompt) {
		console.log('No prompt entered. Exiting.');
		return;
	}

	const nStr = process.env.COUNT
		? process.env.COUNT.trim()
		: (readlineSync.question('How many images? (default 1): ').trim() || '1');
	const n = parseInt(nStr, 10) || 1;

	console.log(`\nGenerating ${n} image(s) with prompt: "${prompt}" ...`);

	try {
		const { images } = await generateImage({
			model: xai.image('grok-imagine-image'),
			prompt,
			n,
			aspectRatio: '9:16',

		});

		const outputDir = path.join(process.cwd(), 'generated-images');
		await fs.mkdir(outputDir, { recursive: true });

		const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

		for (let i = 0; i < images.length; i++) {
			const image = images[i];
			const extension = image.mimeType?.split('/')[1] || 'png';
			const filename = `grok-${timestamp}-${i + 1}.${extension}`;
			const filepath = path.join(outputDir, filename);

			await fs.writeFile(filepath, image.uint8Array);

			console.log(`Saved: ${filepath}`);
			console.log(`   (base64 preview snippet: ${image.base64.slice(0, 50)}...)`);
		}

		console.log(`\nDone! ${images.length} image(s) saved to: ${outputDir}`);
	} catch (error) {
		console.error('Generation failed:', error?.message || error);
		if (error?.status) console.error('Status:', error.status);
		if (error?.response) console.error('Response details:', await error.response?.text?.());
	}
}

main().catch(console.error);