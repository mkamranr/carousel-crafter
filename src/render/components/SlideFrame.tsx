/**
 * One slide's chrome: the fixed canvas, the accent rule, the eyebrow and the footer.
 *
 * The frame is what the capture step screenshots, so its box IS the exported image. Content
 * goes in `.slide__content`, which is the only element the fit loop measures — keeping the
 * eyebrow and footer outside means a long body can never be "fixed" by pushing the handle
 * off-canvas.
 */

import type { ReactNode } from 'react';
import type { Channel } from '../../config/resolve.js';
import type { SlideRole } from '../../types.js';

const CHANNEL_LABELS: Record<Channel['key'], string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  website: 'Web',
};

export interface SlideFrameProps {
  id: string;
  role: SlideRole;
  /** 1-based, as shown to a reader. */
  index: number;
  total: number;
  handle: string | null;
  /** Repeated on content slides so the deck reads as one set rather than ten cards. */
  eyebrow: string | null;
  /** Rendered on the CTA slide only — see the note in `config/schema.ts`. */
  channels: Channel[];
  /** Resolved photo for the cover and CTA: a data URI on export, a served path in preview. */
  backgroundUrl?: string | null;
  /** Photographer credit, shown small on the slides that carry the photo. */
  backgroundCredit?: string | null;
  /** Which roles carry the photo. */
  backgroundOn?: 'cover-cta' | 'cover' | 'all';
  children: ReactNode;
}

export function SlideFrame({
  id,
  role,
  index,
  total,
  handle,
  eyebrow,
  channels,
  backgroundUrl = null,
  backgroundCredit = null,
  backgroundOn = 'cover-cta',
  children,
}: SlideFrameProps) {
  // The cover already states the subject at full size; repeating it above the title would be
  // the same words twice. The CTA is a sign-off, not part of the argument.
  const showEyebrow = role === 'content' && eyebrow !== null && eyebrow !== '';

  // Default is the two slides that are a headline with room to breathe; a content or code
  // slide trades readability for atmosphere. That is a judgement rather than a law, so `all`
  // is available — with a heavier scrim on content slides to keep it survivable.
  const carries =
    backgroundOn === 'all'
      ? true
      : backgroundOn === 'cover'
        ? role === 'cover'
        : role === 'cover' || role === 'cta';
  const showPhoto = carries && !!backgroundUrl;

  return (
    <section
      className={`slide slide--${role}${showPhoto ? ' slide--has-photo' : ''}`}
      data-slide-id={id}
    >
      {showPhoto && (
        <div className="slide__photo" style={{ backgroundImage: `url(${backgroundUrl})` }} />
      )}
      <div className="slide__accent" />
      {showPhoto && backgroundCredit && <div className="slide__credit">{backgroundCredit}</div>}

      <div className="slide__content" data-content-for={id}>
        {/*
          Inside the content block, not pinned above it. Pinned to the top it sat in its own
          band with a dead gap below, reading as unrelated to the heading it introduces;
          inside, the whole group centres as one and the kicker stays attached to its title.
          It carries no data-block-id because it is not a model block — it occupies space the
          fit loop measures, but a split never happens at it.
        */}
        {showEyebrow && <div className="slide__eyebrow">{eyebrow}</div>}
        {children}
        {role === 'cta' && channels.length > 0 && (
          <div className="slide__channels">
            {channels.map((channel) => (
              <div key={channel.key} className="slide__channel">
                <span className="slide__channel-label">{CHANNEL_LABELS[channel.key]}</span>
                <span>{channel.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="slide__footer">
        <span className="slide__handle">{handle ?? ''}</span>
        <span className="slide__index">
          {String(index).padStart(2, '0')} / {String(total).padStart(2, '0')}
        </span>
      </footer>
    </section>
  );
}
