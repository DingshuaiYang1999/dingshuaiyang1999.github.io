// Q&A page: topic filter chips, search, open the linked question.
(function setupQA() {
  const list = document.getElementById("qa-list");
  if (!list) return;
  const items = [...list.querySelectorAll(".qa-item")];
  const search = document.getElementById("qa-search");
  const chips = [...document.querySelectorAll(".chip")];
  const count = document.getElementById("qa-count");
  const empty = document.getElementById("qa-empty");
  let topic = "";

  function apply() {
    const q = (search.value || "").trim().toLowerCase();
    let shown = 0;
    items.forEach((li) => {
      const okTopic = !topic || li.dataset.topic === topic;
      const okText = !q || li.textContent.toLowerCase().includes(q);
      li.hidden = !(okTopic && okText);
      if (!li.hidden) shown++;
    });
    count.textContent = `${shown} of ${items.length} question${items.length === 1 ? "" : "s"}`;
    empty.hidden = shown !== 0 || items.length === 0;
  }

  chips.forEach((chip) =>
    chip.addEventListener("click", () => {
      topic = chip.dataset.topic;
      chips.forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
      apply();
    })
  );
  search.addEventListener("input", apply);

  function openFromHash() {
    const id = decodeURIComponent(window.location.hash.slice(1));
    const li = id && document.getElementById(id);
    if (li && li.classList.contains("qa-item")) {
      li.hidden = false;
      li.querySelector("details").open = true;
    }
  }
  window.addEventListener("hashchange", openFromHash);
  openFromHash();
  apply();
})();
