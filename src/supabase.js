// src/supabase.js
// Supabase client — import this anywhere you need DB access.

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON) {
  console.error("Missing Supabase environment variables. Check VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── AUTH HELPERS ──────────────────────────────────────────────────────────────

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

// ── SHELF HELPERS ─────────────────────────────────────────────────────────────

// Load user's shelf from Supabase
export async function loadShelfFromDB(userId) {
  const { data, error } = await supabase
    .from("user_book_state")
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  return data || [];
}

// Upsert a book state (saved, started, finished, abandoned, dismissed)
export async function upsertBookState(userId, bookData, state) {
  // First ensure book exists in books table
  let bookId = bookData.supabase_id;

  if (!bookId && bookData.isbn) {
    const { data: existing } = await supabase
      .from("books")
      .select("id")
      .eq("isbn", bookData.isbn)
      .single();

    if (existing) {
      bookId = existing.id;
    } else {
      // Insert new book
      const { data: newBook, error: bookError } = await supabase
        .from("books")
        .insert({
          isbn:       bookData.isbn,
          title:      bookData.title,
          title_slug: bookData.title.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
          cover_url:  bookData.cover_url || null,
        })
        .select("id")
        .single();
      if (bookError) throw bookError;
      bookId = newBook.id;
    }
  }

  if (!bookId) return null;

  const { error } = await supabase
    .from("user_book_state")
    .upsert({
      user_id:    userId,
      book_id:    bookId,
      state,
      updated_at: new Date().toISOString(),
    }, { onConflict: "user_id,book_id" });

  if (error) throw error;
  return bookId;
}

// Save a reaction
export async function saveReaction(userId, bookId, reaction, note = null) {
  const { error } = await supabase
    .from("user_book_reactions")
    .insert({ user_id: userId, book_id: bookId, reaction, note });
  if (error) throw error;
}

// ── DISCUSSION HELPERS ────────────────────────────────────────────────────────

// Get or create a discussion thread for a book
export async function getOrCreateDiscussion(book) {
  const isbn = book.isbn || null;

  // Try to find existing
  let query = supabase.from("discussions").select("*");
  if (isbn) {
    query = query.eq("book_isbn", isbn);
  } else {
    query = query.eq("book_title", book.title);
  }

  const { data: existing } = await query.single();
  if (existing) return existing;

  // Create new
  const { data, error } = await supabase
    .from("discussions")
    .insert({
      book_id:     book.supabase_id || null,
      book_title:  book.title,
      book_author: book.author || null,
      book_isbn:   isbn,
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// Get posts for a discussion
export async function getDiscussionPosts(discussionId) {
  const { data, error } = await supabase
    .from("discussion_posts")
    .select("*, author:author_id(email)")
    .eq("discussion_id", discussionId)
    .eq("moderation_status", "approved")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

// Post to a discussion
export async function createDiscussionPost(discussionId, authorId, content) {
  const { data, error } = await supabase
    .from("discussion_posts")
    .insert({
      discussion_id: discussionId,
      author_id:     authorId,
      content,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// Like a post
export async function likePost(postId) {
  const { error } = await supabase.rpc("increment_post_likes", { post_id: postId });
  if (error) {
    // Fallback: direct update
    await supabase
      .from("discussion_posts")
      .update({ like_count: supabase.raw("like_count + 1") })
      .eq("id", postId);
  }
}
