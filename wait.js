const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const run = require('./ai.js');
const chromium = require('@sparticuz/chromium-min');
let puppeteer = require('puppeteer-core');


dotenv.config();

function delay(time) {
    return new Promise(resolve => setTimeout(resolve, time));
}

// Function to manage applied internships
const internshipTracker = {
    filePath: path.join(__dirname, 'applied_internships.json'),

    load() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf8');
                return new Set(JSON.parse(data));
            }
        } catch (error) {
            console.error('Error loading applied internships:', error);
        }
        return new Set();
    },

    save(appliedInternships) {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(Array.from(appliedInternships)), 'utf8');
            console.log('Successfully saved applied internships list');
        } catch (error) {
            console.error('Error saving applied internships:', error);
        }
    }
};

// Function to fill form fields
async function fillFormFields(page, answers) {
    const result = await page.evaluate((answers) => {
        console.log('Starting to fill form fields with answers:', answers);
        const results = {
            textareasFilled: 0,
            quillEditorsFilled: 0,
            selectsFilled: 0,
            checkboxesChecked: 0,
            errors: []
        };

        try {
            const textareas = document.querySelectorAll('textarea.custom-question-answer');
            console.log(`Found ${textareas.length} custom question textareas`);

            textareas.forEach((textarea, index) => {
                if (index < answers.length && answers[index]) {
                    textarea.value = answers[index];
                    textarea.dispatchEvent(new Event('input', { bubbles: true }));
                    textarea.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log(`Filled textarea #${index} (id: ${textarea.id}) with: ${answers[index]}`);
                    results.textareasFilled++;
                } else {
                    console.log(`No answer available for textarea #${index} (id: ${textarea.id})`);
                }
            });

            const quillEditors = document.querySelectorAll('.ql-editor[contenteditable="true"]');
            console.log(`Found ${quillEditors.length} Quill editors`);

            const coverLetterAnswer = answers[0] ||
                "I'm a passionate software developer with experience in full-stack development. " +
                "I've worked on multiple projects and am excited about this opportunity to contribute my skills. " +
                "I'm adaptable, fast-learning, and eager to join your team.";

            quillEditors.forEach((editor, index) => {
                try {
                    editor.innerHTML = '';

                    const paragraph = document.createElement('p');
                    paragraph.textContent = coverLetterAnswer;
                    editor.appendChild(paragraph);


                    editor.dispatchEvent(new Event('input', { bubbles: true }));
                    editor.dispatchEvent(new Event('change', { bubbles: true }));

                    console.log(`Filled Quill editor #${index} with cover letter content`);
                    results.quillEditorsFilled++;
                } catch (editorError) {
                    console.error(`Error filling Quill editor #${index}:`, editorError);
                    results.errors.push(`Quill editor #${index}: ${editorError.message}`);
                }
            });

            if (textareas.length === 0) {
                const inputs = document.querySelectorAll('input[type="text"], textarea:not(.custom-question-answer)');
                console.log(`Found ${inputs.length} generic text inputs and textareas`);

                inputs.forEach((input, index) => {
                    const answerIndex = quillEditors.length > 0 ? index + 1 : index;

                    if (answerIndex < answers.length && answers[answerIndex]) {
                        input.value = answers[answerIndex];
                        input.dispatchEvent(new Event('input', { bubbles: true }));
                        input.dispatchEvent(new Event('change', { bubbles: true }));
                        console.log(`Filled input #${index} (id: ${input.id || 'no-id'}) with: ${answers[answerIndex]}`);
                        results.textareasFilled++;
                    } else {
                        console.log(`No answer available for input #${index} (id: ${input.id || 'no-id'})`);
                    }
                });
            }

            const selects = document.querySelectorAll('select');
            console.log(`Found ${selects.length} select elements`);

            selects.forEach(select => {
                if (select.options.length > 1) {
                    select.selectedIndex = 1;
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                    console.log(`Selected option for select: ${select.id || 'no-id'}`);
                    results.selectsFilled++;
                }
            });

            const checkboxes = document.querySelectorAll('input[type="checkbox"]');
            console.log(`Found ${checkboxes.length} checkboxes`);

            checkboxes.forEach(checkbox => {
                checkbox.checked = true;
                checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                console.log(`Checked checkbox: ${checkbox.id || checkbox.name || 'no-id'}`);
                results.checkboxesChecked++;
            });

            return results;
        } catch (error) {
            console.error('Error in form filling function:', error.message);
            results.errors.push(`Main error: ${error.message}`);
            return results;
        }
    }, answers);

    console.log('Form filling result:', result);

    if (result.quillEditorsFilled === 0) {
        console.log('Attempting alternative Quill editor filling method...');

        try {
            await page.evaluate((coverLetterText) => {
                const coverLetterHolder = document.querySelector('#cover_letter_holder .ql-editor');
                if (coverLetterHolder) {
                    coverLetterHolder.innerHTML = `<p>${coverLetterText}</p>`;
                    console.log('Directly set innerHTML on cover letter holder');


                    coverLetterHolder.dispatchEvent(new Event('input', { bubbles: true }));
                    return true;
                }
                return false;
            }, answers[0] || "I'm a passionate software developer with experience in full-stack development. I've worked on multiple projects and am excited about this opportunity to contribute my skills. I'm adaptable, fast-learning, and eager to join your team.");
        } catch (e) {
            console.error('Alternative Quill editor filling failed:', e);
        }
    }

    return result;
}

async function clickButtonByText(page, textContent) {

    return page.evaluate((text) => {
        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], a.btn'));
        const targetButton = buttons.find(b =>
            b.textContent && b.textContent.toLowerCase().includes(text.toLowerCase()) ||
            b.value && b.value.toLowerCase().includes(text.toLowerCase())
        );

        if (targetButton) {
            targetButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
            console.log(`Clicking button containing text: ${text}`);
            targetButton.click();
            return true;
        }
        return false;
    }, textContent);
}


// Main function
const main = async (email, password, role, letter) => {
    let browser;
    try {
        // Load previously applied internships
        const appliedInternships = internshipTracker.load();
        console.log(`Loaded ${appliedInternships.size} previously applied internships`);

        // browser = await puppeteer.launch({
        //     headless: true,
        //     defaultViewport: { width: 1400, height: 768 },
        // });
        if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
            // Configure the version based on your package.json (for your future usage).
            const executablePath = await chromium.executablePath('https://github.com/Sparticuz/chromium/releases/download/v131.0.1/chromium-v131.0.1-pack.tar')
            browser = await puppeteer.launch({
                executablePath,
                // You can pass other configs as required
                args: chromium.args,
                headless: chromium.headless,
                defaultViewport: chromium.defaultViewport,
                ignoreHTTPSErrors: true,
            })
        } else {
            browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox']
            })
        }

        const page = await browser.newPage();

        // await page.setUserAgent(
        //     'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        // );

        // Navigate and login
        console.log('Navigating to Internshala...');
        await page.goto('https://internshala.com/', { waitUntil: 'networkidle2' });
        await page.click('.login-cta');
        await page.waitForSelector('input[type="email"]');

        await page.type('input[type="email"]', email);
        await page.type('input[type="password"]', password);
        await page.click('button[type="submit"]');
        await page.waitForNavigation();
        console.log('Successfully logged in');

        // Search internships
        console.log('Searching for Web Development internships...');
        await page.goto('https://internshala.com/internships/', { waitUntil: 'networkidle2' });
        await page.waitForSelector('#select_category_chosen');

        await page.click('#select_category_chosen');
        await page.type('.chosen-choices .chosen-search-input', role);

        await page.waitForSelector('.chosen-drop .active-result');
        await page.click('.chosen-drop .chosen-results .active-result');

        await page.waitForSelector('#work_from_home');
        await page.evaluate(() => {
            document.querySelector('#work_from_home').checked = true;
        });

        await delay(2000);

        // Get internship links
        const internships = await page.$$eval('div#internship_list_container a', anchors =>
            anchors.map(a => a.href).filter(href => href)
        );

        console.log(`Found ${internships.length} internships to process`);
        const maxInternshipsToApply = Math.min(5, internships.length);

        // Process each internship
        for (let i = 0; i < maxInternshipsToApply; i++) {
            const href = internships[i];
            console.log(`\nProcessing internship ${i + 1}/${maxInternshipsToApply}: ${href}`);

            await page.goto(href, { waitUntil: 'networkidle2' });

            // Get internship ID
            const internshipId = await page.evaluate(() => {
                const div = document.querySelector('.individual_internship');
                return div ? div.getAttribute('internshipid') : null;
            });

            if (internshipId) {
                console.log(`Internship ID: ${internshipId}`);

                // Skip if already applied
                if (appliedInternships.has(internshipId)) {
                    console.log(`Already applied to internship ${internshipId}, skipping...`);
                    continue;
                }
            }

            // Try clicking the apply button
            let clicked = false;

            // First try: #apply_now_button
            const applyButtonExists = await page.evaluate(() => {
                const button = document.querySelector('#apply_now_button');
                if (button) {
                    button.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    return true;
                }
                return false;
            });

            if (applyButtonExists) {
                try {
                    // Try to click with page.click() first
                    await page.click('#apply_now_button');
                    clicked = true;
                    console.log('Clicked apply button using page.click()');
                } catch (clickError) {
                    // Fall back to JavaScript click
                    clicked = await page.evaluate(() => {
                        const button = document.querySelector('#apply_now_button');
                        if (button) {
                            button.click();
                            return true;
                        }
                        return false;
                    });
                    if (clicked) console.log('Clicked apply button using JavaScript');
                }
            }

            // Second try: Any button with "Apply" text
            if (!clicked) {
                clicked = await clickButtonByText(page, 'apply');
                if (clicked) console.log('Clicked alternative apply button');
            }

            if (!clicked) {
                console.log('No apply button found, skipping to next internship');
                continue;
            }

            // Wait for form to appear
            await delay(2000);

            // Check for form fields
            const hasFormFields = await page.evaluate(() => {
                return !!document.querySelector('form input, form textarea, form select');
            });

            if (hasFormFields) {
                console.log('Form detected, extracting questions...');

                // Extract questions
                const questions = await page.evaluate(() => {
                    const questionElements = Array.from(document.querySelectorAll('.assessment_question label'));
                    return questionElements.map(element => element.textContent.trim());
                });

                console.log(`Found ${questions.length} questions ${questions}`);

                if (questions.length > 0) {
                    // Get AI-generated answers
                    const additionalContext = `Answer the following questions directly and positively as a candidate. 
                        If asked about relocation, say "yes." Use the provided letter for context. 
                        Respond without explanations or formatting — just the plain text answers.
                        Letter start here: ${letter}`;

                    console.log('Generating answers...');
                    const answers = await run(questions, additionalContext);
                    console.log('Answers generated, filling form...');

                    // Fill the form
                    await fillFormFields(page, answers);
                    await delay(1000);
                }
            }

            // Submit the application
            const submitted = await clickButtonByText(page, 'submit application');
            if (submitted) {
                console.log('Clicked submit application button');
                await delay(3000);

                // Check for success message
                const hasSuccessMessage = await page.evaluate(() => {
                    const pageText = document.body.innerText.toLowerCase();
                    return pageText.includes('successfully applied') ||
                        pageText.includes('application submitted') ||
                        pageText.includes('thank you for applying');
                });

                if (hasSuccessMessage) {
                    console.log(`Successfully applied to internship ${i + 1}!`);
                    if (internshipId) {
                        appliedInternships.add(internshipId);
                        internshipTracker.save(appliedInternships);
                    }
                } else {
                    console.log('Could not confirm successful application');
                }
            } else {
                console.log('Could not find submit button');
            }

            await delay(1000);
        }

        console.log('\nApplication process completed');
        console.log('Applied internship IDs:', Array.from(appliedInternships));
        internshipTracker.save(appliedInternships);

        await delay(2000);
        await browser.close();

    } catch (error) {
        console.error('Error:', error);
        if (browser) await browser.close();
    }
}

module.exports = main;