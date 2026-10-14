(async () => {
  // ========== SETTINGS ==========
  const QUESTIONS_TO_DO = 100;
  const ALLOW_WRONG_ANSWERS = true;
  const WRONG_ANSWER_EVERY = 5;

  const WAIT_LOOP = 80;
  const WAIT_AFTER_CLICK = 150;
  const WAIT_AFTER_SUBMIT = 200;

  // Extra time for delayed NEXT buttons on next-only questions.
  const NEXT_ONLY_WAIT_MS = 5000;
  const NEXT_POLL_MS = 150;
  // ==============================

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const visible = el => !!el &&
    getComputedStyle(el).display !== "none" &&
    getComputedStyle(el).visibility !== "hidden" &&
    el.getClientRects().length > 0;

  const norm = s => (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  let vocab = window.suburaniVocab;

  if (!vocab?.length) {
    vocab = [...document.querySelectorAll(".lattxt")]
      .map(el => ({
        latin: el.innerText.trim(),
        english:
          el.closest("tr")?.querySelector(".engtxt")?.innerText.trim() || ""
      }))
      .filter(v => v.latin && v.english);
  }

  const normalizedVocab = vocab.map(v => ({
    latin: norm(v.latin),
    english: v.english,
    meaning: norm(v.english)
  }));

  const vocabMap = new Map();

  for (const v of normalizedVocab) {
    if (!vocabMap.has(v.latin)) {
      vocabMap.set(v.latin, v.english);
    }
  }

  function getLines() {
    const lines = document.body.innerText.split("\n")
      .map(s => s.trim())
      .filter(Boolean);

    const idx = lines.findIndex(s => /^\d+\s*\/\s*\d+$/.test(s));
    return idx < 0 ? [] : lines.slice(idx + 1, idx + 10);
  }

  function getMatch(lines) {
    const cleanLines = lines.map(norm);

    for (const line of cleanLines) {
      if (vocabMap.has(line)) return vocabMap.get(line);
    }

    let best = null;
    let bestLength = 0;

    for (const line of cleanLines) {
      for (const v of normalizedVocab) {
        if (
          v.latin.length > bestLength &&
          v.latin.length > 2 &&
          (line.startsWith(v.latin + " ") || line.includes(v.latin))
        ) {
          best = v.english;
          bestLength = v.latin.length;
        }
      }
    }

    return best;
  }

  function getNextButton() {
    const candidates = [
      ...document.querySelectorAll(
        '#nextq1, #nextq2, button, input[type="button"], ' +
        'input[type="submit"], [role="button"], a, [onclick]'
      )
    ];

    return candidates.find(el => {
      if (!visible(el) || el.disabled) return false;

      const text = norm(
        el.innerText || el.value || el.getAttribute("aria-label") || ""
      );

      return (
        ["nextq1", "nextq2"].includes(el.id) ||
        /^(next|next question|continue|skip|go next)$/.test(text)
      );
    });
  }

  function clickNext() {
    const next = getNextButton();
    if (!next) return false;

    next.click();
    return true;
  }

  function getChoices() {
    return ["#altern1", "#altern2", "#altern3"]
      .map(selector => document.querySelector(selector))
      .filter(el => visible(el) && !el.disabled);
  }

  function getFields() {
    return [...document.querySelectorAll("input, textarea")]
      .filter(el =>
        visible(el) &&
        !el.disabled &&
        !["checkbox", "radio", "button", "submit", "hidden"]
          .includes((el.type || "").toLowerCase())
      );
  }

  function getQuestionId() {
    const lines = getLines();
    const choices = getChoices().map(el => norm(el.innerText)).join("|");
    return lines.join("|") + "::" + choices;
  }

  function shouldMakeWrong(processed) {
    return ALLOW_WRONG_ANSWERS &&
      (processed + 1) % Math.max(1, WRONG_ANSWER_EVERY) === 0;
  }

  function findMatchingChoice(choices, answer) {
    if (!answer) return null;

    const meaning = norm(answer);
    const matching = choices.filter(el =>
      norm(el.innerText.replace(/^\s*[123]\s*/, "")) === meaning
    );

    return matching.length === 1 ? matching[0] : null;
  }

  // Wait longer for delayed NEXT controls.
  async function waitForNext(timeout = NEXT_ONLY_WAIT_MS) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const next = getNextButton();

      if (next) {
        next.click();
        return true;
      }

      await sleep(NEXT_POLL_MS);
    }

    return false;
  }

  let processed = 0;
  let intendedCorrect = 0;
  let intendedWrong = 0;
  let bestGuesses = 0;
  let nextOnly = 0;
  let skipped = 0;
  let previousQuestionId = "";

  console.log("Automation started.", {
    target: QUESTIONS_TO_DO,
    vocabularyEntries: vocab.length,
    nextOnlyWaitMs: NEXT_ONLY_WAIT_MS
  });

  while (processed < QUESTIONS_TO_DO) {
    await sleep(WAIT_LOOP);

    const pageText = document.body.innerText;
    const completed = /\bCorrect!|\bIncorrect\b|\bTry again\b/i.test(pageText);

    // Advance after feedback appears for a completed question.
    if (completed && getNextButton()) {
      clickNext();
      await sleep(WAIT_AFTER_CLICK);
      previousQuestionId = "";
      continue;
    }

    const lines = getLines();
    const questionId = getQuestionId();

    if (!questionId || questionId === previousQuestionId) {
      continue;
    }

    const choices = getChoices();
    const fields = getFields();
    const answer = getMatch(lines);
    const makeWrong = shouldMakeWrong(processed);

    // ========== MULTIPLE CHOICE ==========
    if (choices.length >= 2) {
      let choice = findMatchingChoice(choices, answer);

      if (!choice) {
        choice = choices[Math.floor(Math.random() * choices.length)];
        bestGuesses++;

        console.log("Best guess:", {
          question: lines,
          guess: choice.innerText.trim()
        });
      }

      if (makeWrong) {
        const alternatives = choices.filter(el => el !== choice);

        if (alternatives.length) {
          choice = alternatives[Math.floor(Math.random() * alternatives.length)];
        }
      }

      previousQuestionId = questionId;
      choice.click();
      processed++;

      if (makeWrong) intendedWrong++;
      else intendedCorrect++;

      console.log(
        `Question ${processed}/${QUESTIONS_TO_DO}: ${choice.innerText.trim()}`
      );

      await sleep(WAIT_AFTER_CLICK);

      // If incorrect, attempt to choose the correct option.
      const feedback = document.body.innerText;

      if (/incorrect|try again|not correct/i.test(feedback)) {
        await sleep(WAIT_AFTER_SUBMIT);

        const updatedChoices = getChoices();
        const updatedAnswer = getMatch(getLines());
        const correctChoice = findMatchingChoice(
          updatedChoices,
          updatedAnswer
        );

        if (correctChoice) {
          correctChoice.click();

          console.log(
            "Retried with matched answer:",
            correctChoice.innerText.trim()
          );

          await sleep(WAIT_AFTER_CLICK);
        } else {
          console.log(
            "Incorrect feedback detected, but couldn't identify the correct choice."
          );
        }
      }

      continue;
    }

    // ========== FILL-IN-THE-BLANK ==========
    if (fields.length === 1) {
      let value = answer;

      if (!value) {
        const candidates = vocab.filter(v => v.english);

        value = candidates.length
          ? candidates[Math.floor(Math.random() * candidates.length)].english
          : "unknown";

        bestGuesses++;

        console.log("Best-guess fill-in:", {
          question: lines,
          answer: value
        });
      }

      if (makeWrong) {
        const alternatives = vocab.filter(
          v => norm(v.english) !== norm(value) && v.english
        );

        value = alternatives.length
          ? alternatives[Math.floor(Math.random() * alternatives.length)].english
          : "unknown";
      }

      const field = fields[0];
      field.focus();

      const setter = Object.getOwnPropertyDescriptor(
        Object.getPrototypeOf(field), "value"
      )?.set;

      if (setter) setter.call(field, value);
      else field.value = value;

      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));

      previousQuestionId = questionId;
      processed++;

      if (makeWrong) intendedWrong++;
      else intendedCorrect++;

      await sleep(WAIT_AFTER_SUBMIT);

      const check = document.querySelector("#checkbtn");

      if (visible(check)) {
        check.click();
        await sleep(WAIT_AFTER_SUBMIT);
      }

      if (getNextButton()) {
        clickNext();
        await sleep(WAIT_AFTER_CLICK);
        previousQuestionId = "";
      }

      continue;
    }

    // ========== NEXT-ONLY QUESTION ==========
    if (choices.length === 0 && fields.length === 0) {
      console.log(
        `Next-only question detected. Waiting up to ${NEXT_ONLY_WAIT_MS} ms for NEXT...`
      );

      // Give the page time to reveal NEXT after its delayed feedback.
      let advanced = await waitForNext();

      // Some activities need CHECK first.
      if (!advanced) {
        const check = document.querySelector("#checkbtn");

        if (visible(check) && !check.disabled) {
          console.log("NEXT hasn't appeared; trying CHECK.");
          check.click();
          await sleep(WAIT_AFTER_SUBMIT);

          advanced = await waitForNext();
        }
      }

      if (advanced) {
        processed++;
        nextOnly++;
        previousQuestionId = "";

        console.log(`Advanced through next-only question (${processed}/${QUESTIONS_TO_DO}).`);

        await sleep(WAIT_AFTER_CLICK);
        continue;
      }

      console.log("Couldn't find NEXT after waiting. Visible controls:", {
        question: lines,
        controls: [...document.querySelectorAll(
          'button, input[type="button"], input[type="submit"], [role="button"], a, [onclick]'
        )]
          .filter(visible)
          .map(el => ({
            id: el.id,
            text: (el.innerText || el.value || "").trim(),
            disabled: el.disabled
          }))
      });

      break;
    }

    console.log("Paused: unrecognized question type.", {
      question: lines,
      choices: choices.length,
      fields: fields.length
    });

    break;
  }

  console.log("Automation finished or paused.", {
    processed,
    target: QUESTIONS_TO_DO,
    intendedCorrect,
    intendedWrong,
    bestGuesses,
    nextOnly,
    skipped
  });
})();
