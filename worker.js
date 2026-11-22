export default {
  async fetch(request, env) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // GET: Ambil semua rekod journal dan expenses
      if (request.method === "GET") {
        const journalRes = await env.DB.prepare(
          "SELECT id, date, time, type, category, title, content, done FROM journal ORDER BY created_at ASC"
        ).all();

        const expensesRes = await env.DB.prepare(
          "SELECT id, date, amount, category, note FROM expenses ORDER BY created_at ASC"
        ).all();

        const journal = (journalRes.results || []).map(row => ({
          ...row,
          done: row.done === 1 || row.done === true
        }));

        return new Response(JSON.stringify({
          status: "ok",
          journal: journal,
          expenses: expensesRes.results || []
        }), { headers: corsHeaders });
      }

      // POST: Tambah, kemaskini, atau padam rekod
      if (request.method === "POST") {
        const body = await request.json();
        const validPin = env.APP_PIN || "2611";

        if (String(body.pin || "") !== String(validPin)) {
          return new Response(JSON.stringify({ status: "error", message: "Invalid PIN" }), {
            status: 401,
            headers: corsHeaders
          });
        }

        if (body.action === "add" && body.target === "expense") {
          const id = "exp_" + Date.now();
          await env.DB.prepare(
            "INSERT INTO expenses (id, date, amount, category, note) VALUES (?, ?, ?, ?, ?)"
          ).bind(
            id,
            String(body.date || ""),
            Number(body.amount) || 0,
            String(body.category || "Other"),
            String(body.note || "")
          ).run();

          return new Response(JSON.stringify({ status: "ok", id }), { headers: corsHeaders });
        }

        if (body.action === "add" && body.target === "journal") {
          const id = "jrn_" + Date.now();
          await env.DB.prepare(
            "INSERT INTO journal (id, date, time, type, category, title, content, done) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
          ).bind(
            id,
            String(body.date || ""),
            String(body.time || "All Day"),
            String(body.type || "Diary"),
            String(body.category || "Personal"),
            String(body.title || ""),
            String(body.content || ""),
            body.done ? 1 : 0
          ).run();

          return new Response(JSON.stringify({ status: "ok", id }), { headers: corsHeaders });
        }

        if (body.action === "toggle_done" && body.target === "journal") {
          await env.DB.prepare(
            "UPDATE journal SET done = ? WHERE id = ?"
          ).bind(body.done ? 1 : 0, String(body.id)).run();

          return new Response(JSON.stringify({ status: "ok" }), { headers: corsHeaders });
        }

        if (body.action === "delete" && body.target === "expense") {
          await env.DB.prepare("DELETE FROM expenses WHERE id = ?").bind(String(body.id)).run();
          return new Response(JSON.stringify({ status: "ok" }), { headers: corsHeaders });
        }

        if (body.action === "delete" && body.target === "journal") {
          await env.DB.prepare("DELETE FROM journal WHERE id = ?").bind(String(body.id)).run();
          return new Response(JSON.stringify({ status: "ok" }), { headers: corsHeaders });
        }

        return new Response(JSON.stringify({ status: "error", message: "Unknown action" }), {
          status: 400,
          headers: corsHeaders
        });
      }

      return new Response(JSON.stringify({ status: "error", message: "Method not allowed" }), {
        status: 405,
        headers: corsHeaders
      });
    } catch (err) {
      return new Response(JSON.stringify({ status: "error", message: err.message }), {
        status: 500,
        headers: corsHeaders
      });
    }
  }
};
