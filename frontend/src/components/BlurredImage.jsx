export default function BlurredImage({ media, onClick }) {
  if (!media) return <div className="tile tile--empty" />;
  if (media.locked) {
    return (
      <div className="tile tile--locked" onClick={onClick}>
        {media.urls.blurred && <img src={media.urls.blurred} alt="locked" />}
        <div className="tile__lock">🔒</div>
      </div>
    );
  }
  return (
    <div className="tile" onClick={onClick}>
      {media.urls.thumb && <img src={media.urls.thumb} alt="" loading="lazy" />}
    </div>
  );
}
