-- The copy keys follow the template's Dictionary.
--
-- Keys are schema rather than data: one exists because CAFA-Template's
-- `Dictionary` type has a field for it, and the template re-parses every one of
-- them at build time. So a key the template has stopped reading is dead weight,
-- and a key it has started reading is a failed build until this runs — which is
-- why key changes arrive as a migration, beside the code that reads them.
--
-- Three changes on the template's side, in the commits after the works index
-- grew a grid and the contact card grew a form:
--
--   home.worksLink      gone. The front page carried one link under its
--                       statement; the nav carries one on every page including
--                       that one, so the second was a duplicate.
--   about.studioTitle   gone. The studio photographs left the about page — they
--                       run down the home page below the statement now.
--   about.worksTitle    new. What took their place: a grid of the published
--                       works, under a heading of its own.
--   contact.*           four new. The card is no longer four addresses; it has
--                       a message form beside them. `from` and `message` name
--                       the two fields, `send` is the word on the button, and
--                       `subject` is the line the reader's own mail client
--                       opens with — copy, because a visitor reads it.
--
-- The English and Chinese below are defaults, not decisions. Every one of them
-- is editable in Site text the moment this is applied.
--
-- Apply this *before* deploying the Worker that goes with it, and do the two
-- together: a save writes the whole copy table from the dictionary the editor
-- is holding, so an old editor saving in between would drop the four new keys
-- again. The window is one deploy and there is one person in the admin, but the
-- order is free.

DELETE FROM copy WHERE key IN ('home.worksLink', 'about.studioTitle');

INSERT OR IGNORE INTO copy (key, zh, en) VALUES
  ('about.worksTitle', '作品',     'Works'),
  ('contact.from',     '您的邮箱', 'Your email'),
  ('contact.message',  '留言',     'Message'),
  ('contact.subject',  '网站来信', 'Enquiry from the website'),
  ('contact.send',     '发送',     'Send');
