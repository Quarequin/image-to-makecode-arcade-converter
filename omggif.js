// --- Embedded Offline omggif Engine Core (v1.0.10) ---
      const omggif = (function() {
        const exports = {};
        function GifReader(buf) {
          let p = 0;
          if (buf[p++] !== 0x47 || buf[p++] !== 0x49 || buf[p++] !== 0x46 || buf[p++] !== 0x38 || (buf[p++] !== 0x37 && buf[p] !== 0x39) || buf[p++] !== 0x61) {
            throw new Error("Invalid GIF file header format. The binary data is corrupted or modified.");
          }
          const width = buf[p++] | (buf[p++] << 8);
          const height = buf[p++] | (buf[p++] << 8);
          const pf0 = buf[p++];
          const global_palette_flag = pf0 & 0x80;
          const num_global_colors = 2 << (pf0 & 0x7);
          p++; p++;
          this.width = width; this.height = height;
          let global_palette_offset = null;
          if (global_palette_flag) { global_palette_offset = p; p += num_global_colors * 3; }
          const frames = [];
          while (p < buf.length) {
            const block_id = buf[p++];
            if (block_id === 0x3B) { break; }
            if (block_id === 0x21) {
              const label = buf[p++];
              if (label === 0xF9) {
                p++; const flg = buf[p++];
                const delay = buf[p++] | (buf[p++] << 8);
                const transparent_index = buf[p++]; p++;
                frames.push({ x:0, y:0, width:0, height:0, has_local_palette:false, palette_offset:null, data_offset:0, data_length:0, transparent_index: (flg & 1) ? transparent_index : null, delay: delay, disposal: (flg >> 2) & 7 });
              } else {
                let sub_len = buf[p++]; while (sub_len !== 0) { p += sub_len; sub_len = buf[p++]; }
              }
            } else if (block_id === 0x2C) {
              const x = buf[p++] | (buf[p++] << 8); const y = buf[p++] | (buf[p++] << 8);
              const w = buf[p++] | (buf[p++] << 8); const h = buf[p++] | (buf[p++] << 8);
              const pf1 = buf[p++]; const local_palette_flag = pf1 & 0x80;
              const num_local_colors = 2 << (pf1 & 0x7);
              let palette_offset = null;
              if (local_palette_flag) { palette_offset = p; p += num_local_colors * 3; }
              const data_offset = p; p++;
              let sub_len = buf[p++]; while (sub_len !== 0) { p += sub_len; sub_len = buf[p++]; }
              if (frames.length === 0 || frames[frames.length - 1].data_length !== 0) {
                frames.push({ x: x, y: y, width: w, height: h, has_local_palette: !!local_palette_flag, palette_offset: palette_offset, data_offset: data_offset, data_length: p - data_offset, transparent_index: null, delay: 10, disposal: 0 });
              } else {
                const f = frames[frames.length - 1]; f.x = x; f.y = y; f.width = w; f.height = h; f.has_local_palette = !!local_palette_flag; f.palette_offset = palette_offset; f.data_offset = data_offset; f.data_length = p - data_offset;
              }
            }
          }
          this.numFrames = function() { return frames.length; };
          this.globalPalette = function() {
            if (!global_palette_flag) return null;
            const res = []; for(let i=0; i<num_global_colors; i++) { res.push((buf[global_palette_offset+i*3]<<16)|(buf[global_palette_offset+i*3+1]<<8)|buf[global_palette_offset+i*3+2]); }
            return res;
          };
          this.frameInfo = function(idx) { return frames[idx]; };
          this.decodeAndBlitFrame = function(idx, pixels) {
            const f = frames[idx];
            const pal_offset = f.has_local_palette ? f.palette_offset : global_palette_offset;
            if (pal_offset === null) throw new Error("Missing color palette descriptor for frame blitting.");
            let p = f.data_offset; const min_code_size = buf[p++];
            let clear_code = 1 << min_code_size; let end_code = clear_code + 1; let code_size = min_code_size + 1; let code_mask = (1 << code_size) - 1;
            const prefix = new Int32Array(4096); const suffix = new Uint8Array(4096); const stack = new Uint8Array(4096);
            let stack_p = 0;
            for (let i = 0; i < clear_code; ++i) suffix[i] = i;
            let n_codes = end_code + 1; let old_code = -1;
            let bits = 0; let rem_byte = 0; let sub_len = 0; let byte_buf = 0;
            let pixel_idx = 0; const target_length = f.width * f.height;
            while (pixel_idx < target_length) {
              if (bits < code_size) {
                if (rem_byte === 0) {
                  if (sub_len === 0) { sub_len = buf[p++]; if (sub_len === 0) break; }
                  byte_buf = buf[p++]; rem_byte = 8; sub_len--;
                }
                bits |= byte_buf << (16 - rem_byte);
                byte_buf = 0; rem_byte = 0;
                if (sub_len === 0) { sub_len = buf[p++]; if (sub_len === 0) rem_byte = 0; else { byte_buf = buf[p++]; rem_byte = 8; sub_len--; } }
                if (rem_byte === 0) { bits >>= 16; continue; }
              }
              let code = bits & code_mask; bits >>= code_size;
              if (code === clear_code) { code_size = min_code_size + 1; code_mask = (1 << code_size) - 1; n_codes = end_code + 1; old_code = -1; continue; }
              if (code === end_code) break;
              if (code < n_codes) {
                let c = code; while (c >= clear_code) { stack[stack_p++] = suffix[c]; c = prefix[c]; }
                stack[stack_p++] = c; let first_byte = c;
                if (old_code !== -1 && n_codes < 4096) { prefix[n_codes] = old_code; suffix[n_codes] = first_byte; n_codes++; if ((n_codes & code_mask) === 0 && code_size < 12) { code_size++; code_mask = (1 << code_size) - 1; } }
                old_code = code;
                while (stack_p > 0) {
                  const out_idx = pixel_idx++; const val = stack[--stack_p];
                  const r = out_idx % f.width; const c = Math.floor(out_idx / f.width);
                  const real_x = f.x + r; const real_y = f.y + c;
                  if (real_x >= 0 && real_x < width && real_y >= 0 && real_y < height) {
                    const base = (real_y * width + real_x) * 4;
                    if (val !== f.transparent_index) {
                      pixels[base] = buf[pal_offset + val * 3]; pixels[base+1] = buf[pal_offset + val * 3 + 1]; pixels[base+2] = buf[pal_offset + val * 3 + 2]; pixels[base+3] = 255;
                    }
                  }
                }
              } else {
                let c = old_code; while (c >= clear_code) { stack[stack_p++] = suffix[c]; c = prefix[c]; }
                stack[stack_p++] = c; const first_byte = c;
                if (n_codes < 4096) { prefix[n_codes] = old_code; suffix[n_codes] = first_byte; n_codes++; if ((n_codes & code_mask) === 0 && code_size < 12) { code_size++; code_mask = (1 << code_size) - 1; } }
                old_code = code;
                while (stack_p > 0) {
                  const out_idx = pixel_idx++; const val = stack[--stack_p];
                  const real_x = f.x + (out_idx % f.width); const real_y = f.y + Math.floor(out_idx / f.width);
                  if (real_x >= 0 && real_x < width && real_y >= 0 && real_y < height) {
                    const base = (real_y * width + real_x) * 4;
                    if (val !== f.transparent_index) {
                      pixels[base] = buf[pal_offset + val * 3]; pixels[base+1] = buf[pal_offset + val * 3 + 1]; pixels[base+2] = buf[pal_offset + val * 3 + 2]; pixels[base+3] = 255;
                    }
                  }
                }
              }
            }
          };
        }
        exports.GifReader = GifReader;
        return exports;
      })();
