(() => {
  "use strict";

  const mixinKeyEncTab = [
    46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5,
    49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24,
    55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6,
    63, 57, 62, 11, 36, 20, 34, 44, 52,
  ];

  function md5(input) {
    function add32(a, b) {
      return (a + b) & 0xffffffff;
    }

    function cmn(q, a, b, x, s, t) {
      a = add32(add32(a, q), add32(x, t));
      return add32((a << s) | (a >>> (32 - s)), b);
    }

    function ff(a, b, c, d, x, s, t) {
      return cmn((b & c) | (~b & d), a, b, x, s, t);
    }

    function gg(a, b, c, d, x, s, t) {
      return cmn((b & d) | (c & ~d), a, b, x, s, t);
    }

    function hh(a, b, c, d, x, s, t) {
      return cmn(b ^ c ^ d, a, b, x, s, t);
    }

    function ii(a, b, c, d, x, s, t) {
      return cmn(c ^ (b | ~d), a, b, x, s, t);
    }

    function cycle(state, block) {
      let [a, b, c, d] = state;

      a = ff(a, b, c, d, block[0], 7, -680876936);
      d = ff(d, a, b, c, block[1], 12, -389564586);
      c = ff(c, d, a, b, block[2], 17, 606105819);
      b = ff(b, c, d, a, block[3], 22, -1044525330);
      a = ff(a, b, c, d, block[4], 7, -176418897);
      d = ff(d, a, b, c, block[5], 12, 1200080426);
      c = ff(c, d, a, b, block[6], 17, -1473231341);
      b = ff(b, c, d, a, block[7], 22, -45705983);
      a = ff(a, b, c, d, block[8], 7, 1770035416);
      d = ff(d, a, b, c, block[9], 12, -1958414417);
      c = ff(c, d, a, b, block[10], 17, -42063);
      b = ff(b, c, d, a, block[11], 22, -1990404162);
      a = ff(a, b, c, d, block[12], 7, 1804603682);
      d = ff(d, a, b, c, block[13], 12, -40341101);
      c = ff(c, d, a, b, block[14], 17, -1502002290);
      b = ff(b, c, d, a, block[15], 22, 1236535329);

      a = gg(a, b, c, d, block[1], 5, -165796510);
      d = gg(d, a, b, c, block[6], 9, -1069501632);
      c = gg(c, d, a, b, block[11], 14, 643717713);
      b = gg(b, c, d, a, block[0], 20, -373897302);
      a = gg(a, b, c, d, block[5], 5, -701558691);
      d = gg(d, a, b, c, block[10], 9, 38016083);
      c = gg(c, d, a, b, block[15], 14, -660478335);
      b = gg(b, c, d, a, block[4], 20, -405537848);
      a = gg(a, b, c, d, block[9], 5, 568446438);
      d = gg(d, a, b, c, block[14], 9, -1019803690);
      c = gg(c, d, a, b, block[3], 14, -187363961);
      b = gg(b, c, d, a, block[8], 20, 1163531501);
      a = gg(a, b, c, d, block[13], 5, -1444681467);
      d = gg(d, a, b, c, block[2], 9, -51403784);
      c = gg(c, d, a, b, block[7], 14, 1735328473);
      b = gg(b, c, d, a, block[12], 20, -1926607734);

      a = hh(a, b, c, d, block[5], 4, -378558);
      d = hh(d, a, b, c, block[8], 11, -2022574463);
      c = hh(c, d, a, b, block[11], 16, 1839030562);
      b = hh(b, c, d, a, block[14], 23, -35309556);
      a = hh(a, b, c, d, block[1], 4, -1530992060);
      d = hh(d, a, b, c, block[4], 11, 1272893353);
      c = hh(c, d, a, b, block[7], 16, -155497632);
      b = hh(b, c, d, a, block[10], 23, -1094730640);
      a = hh(a, b, c, d, block[13], 4, 681279174);
      d = hh(d, a, b, c, block[0], 11, -358537222);
      c = hh(c, d, a, b, block[3], 16, -722521979);
      b = hh(b, c, d, a, block[6], 23, 76029189);
      a = hh(a, b, c, d, block[9], 4, -640364487);
      d = hh(d, a, b, c, block[12], 11, -421815835);
      c = hh(c, d, a, b, block[15], 16, 530742520);
      b = hh(b, c, d, a, block[2], 23, -995338651);

      a = ii(a, b, c, d, block[0], 6, -198630844);
      d = ii(d, a, b, c, block[7], 10, 1126891415);
      c = ii(c, d, a, b, block[14], 15, -1416354905);
      b = ii(b, c, d, a, block[5], 21, -57434055);
      a = ii(a, b, c, d, block[12], 6, 1700485571);
      d = ii(d, a, b, c, block[3], 10, -1894986606);
      c = ii(c, d, a, b, block[10], 15, -1051523);
      b = ii(b, c, d, a, block[1], 21, -2054922799);
      a = ii(a, b, c, d, block[8], 6, 1873313359);
      d = ii(d, a, b, c, block[15], 10, -30611744);
      c = ii(c, d, a, b, block[6], 15, -1560198380);
      b = ii(b, c, d, a, block[13], 21, 1309151649);
      a = ii(a, b, c, d, block[4], 6, -145523070);
      d = ii(d, a, b, c, block[11], 10, -1120210379);
      c = ii(c, d, a, b, block[2], 15, 718787259);
      b = ii(b, c, d, a, block[9], 21, -343485551);

      state[0] = add32(state[0], a);
      state[1] = add32(state[1], b);
      state[2] = add32(state[2], c);
      state[3] = add32(state[3], d);
    }

    function blockOf(str) {
      const blocks = [];
      for (let i = 0; i < 64; i += 4) {
        blocks[i >> 2] =
          str.charCodeAt(i) +
          (str.charCodeAt(i + 1) << 8) +
          (str.charCodeAt(i + 2) << 16) +
          (str.charCodeAt(i + 3) << 24);
      }
      return blocks;
    }

    function digest(str) {
      let n = str.length;
      const result = [1732584193, -271733879, -1732584194, 271733878];
      let i;
      for (i = 64; i <= n; i += 64) {
        cycle(result, blockOf(str.substring(i - 64, i)));
      }
      str = str.substring(i - 64);
      const tail = Array(16).fill(0);
      for (i = 0; i < str.length; i += 1) {
        tail[i >> 2] |= str.charCodeAt(i) << (8 * (i % 4));
      }
      tail[i >> 2] |= 0x80 << (8 * (i % 4));
      if (i > 55) {
        cycle(result, tail);
        tail.fill(0);
      }
      n *= 8;
      tail[14] = n;
      cycle(result, tail);
      return result;
    }

    function hex(number) {
      let value = "";
      for (let i = 0; i < 4; i += 1) {
        value += `0${((number >> (i * 8)) & 255).toString(16)}`.slice(-2);
      }
      return value;
    }

    return digest(input).map(hex).join("");
  }

  function keyFromUrl(url) {
    return String(url || "")
      .split("/")
      .pop()
      .split(".")[0];
  }

  function mixinKeyFromWbiImage(wbiImage) {
    const imgKey = keyFromUrl(wbiImage?.img_url);
    const subKey = keyFromUrl(wbiImage?.sub_url);
    if (!imgKey || !subKey) return "";
    const raw = `${imgKey}${subKey}`;
    return mixinKeyEncTab.map((index) => raw[index]).join("").slice(0, 32);
  }

  function sign(params, mixinKey) {
    const signed = {
      ...params,
      wts: Math.round(Date.now() / 1000),
    };
    const query = Object.keys(signed)
      .sort()
      .map((key) => {
        const value = String(signed[key]).replace(/[!'()*]/g, "");
        return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
      })
      .join("&");
    return `${query}&w_rid=${md5(query + mixinKey)}`;
  }

  window.__biliWbi = {
    md5,
    mixinKeyFromWbiImage,
    sign,
  };
})();
