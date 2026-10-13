// Full styles load alongside the document without blocking the first screen.
// A noscript stylesheet in the HTML provides the same page without JavaScript.
document.querySelectorAll('link[data-yr-full-styles]').forEach(function (link) {
  function apply() { link.media = 'all' }
  link.addEventListener('load', apply, { once: true })
  if (link.sheet) apply()
})
