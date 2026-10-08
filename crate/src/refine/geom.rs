#[derive(Clone)]
pub struct Sub {
    pub pts: Vec<(f32, f32)>,
    pub line: Vec<bool>,
    pub tied: bool,
}

#[derive(Clone)]
pub struct Layer {
    pub subs: Vec<Sub>,
    pub off: (f32, f32),
    pub color: [f32; 3],
    pub side: f32,
    pub src: Option<(usize, usize)>,
}

pub fn dist(a: (f32, f32), b: (f32, f32)) -> f32 {
    ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt()
}

fn parse_hex(s: &str) -> Option<[f32; 3]> {
    if s.len() != 7 || !s.starts_with('#') {
        return None;
    }
    let v = u32::from_str_radix(&s[1..], 16).ok()?;
    Some([(v >> 16 & 255) as f32, (v >> 8 & 255) as f32, (v & 255) as f32])
}

fn close(sub: &mut Sub) {
    if let (Some(&f), Some(&l)) = (sub.pts.first(), sub.pts.last()) {
        if sub.pts.len() > 1 && dist(f, l) < 1e-3 {
            sub.tied = true;
            let n = sub.pts.len();
            sub.pts[n - 1] = f;
        }
    }
}

fn parse_d(d: &str, off: (f32, f32)) -> Vec<Sub> {
    let mut subs: Vec<Sub> = Vec::new();
    let mut cmd = b'M';
    let mut nums: Vec<f32> = Vec::new();
    let bytes = d.as_bytes();
    let mut i = 0;
    let flush = |cmd: u8, nums: &mut Vec<f32>, subs: &mut Vec<Sub>| {
        let pt = |k: usize| (nums[k] + off.0, nums[k + 1] + off.1);
        match cmd {
            b'M' if nums.len() >= 2 => subs.push(Sub { pts: vec![pt(0)], line: Vec::new(), tied: false }),
            b'L' if nums.len() >= 2 => {
                if let Some(s) = subs.last_mut() {
                    s.pts.push(pt(0));
                    s.line.push(true);
                }
            }
            b'C' if nums.len() >= 6 => {
                if let Some(s) = subs.last_mut() {
                    s.pts.push(pt(0));
                    s.pts.push(pt(2));
                    s.pts.push(pt(4));
                    s.line.push(false);
                }
            }
            _ => {}
        }
        nums.clear();
    };
    while i < bytes.len() {
        let c = bytes[i];
        if c.is_ascii_alphabetic() {
            if !nums.is_empty() {
                flush(cmd, &mut nums, &mut subs);
            }
            if c == b'Z' || c == b'z' {
                if let Some(s) = subs.last_mut() {
                    close(s);
                }
            }
            cmd = c;
            i += 1;
        } else if c == b'-' || c == b'.' || c.is_ascii_digit() {
            let st = i;
            i += 1;
            while i < bytes.len() && (bytes[i].is_ascii_digit() || bytes[i] == b'.') {
                i += 1;
            }
            nums.push(d[st..i].parse().unwrap_or(0.0));
            let need = match cmd {
                b'M' | b'L' => 2,
                b'C' => 6,
                _ => 99,
            };
            if nums.len() == need {
                flush(cmd, &mut nums, &mut subs);
            }
        } else {
            i += 1;
        }
    }
    subs.retain(|s| !s.line.is_empty());
    subs
}

pub fn polys(l: &Layer, s: f32) -> Vec<Vec<(f32, f32)>> {
    l.subs.iter().map(|sub| poly(sub, s)).collect()
}

fn poly(sub: &Sub, s: f32) -> Vec<(f32, f32)> {
    let sc = |p: (f32, f32)| (p.0 * s, p.1 * s);
    let mut out = vec![sc(sub.pts[0])];
    let mut idx = 0;
    for &ln in &sub.line {
        if ln {
            out.push(sc(sub.pts[idx + 1]));
            idx += 1;
        } else {
            let (p0, c1, c2, e) = (sc(sub.pts[idx]), sc(sub.pts[idx + 1]), sc(sub.pts[idx + 2]), sc(sub.pts[idx + 3]));
            let n = (((dist(p0, c1) + dist(c1, c2) + dist(c2, e)) / 1.5) as usize).clamp(2, 24);
            for k in 1..=n {
                let t = k as f32 / n as f32;
                let u = 1.0 - t;
                let (b0, b1, b2, b3) = (u * u * u, 3.0 * u * u * t, 3.0 * u * t * t, t * t * t);
                out.push((b0 * p0.0 + b1 * c1.0 + b2 * c2.0 + b3 * e.0, b0 * p0.1 + b1 * c1.1 + b2 * c2.1 + b3 * e.1));
            }
            idx += 3;
        }
    }
    out
}

fn area(p: &[(f32, f32)]) -> f32 {
    let mut a = 0.0;
    for i in 0..p.len() {
        let (q, r) = (p[i], p[(i + 1) % p.len()]);
        a += q.0 * r.1 - r.0 * q.1;
    }
    0.5 * a
}

fn orientation(l: &Layer) -> f32 {
    let mut best = 0f32;
    for sub in &l.subs {
        let a = area(&poly(sub, 1.0));
        if a.abs() > best.abs() {
            best = a;
        }
    }
    if best < 0.0 {
        -1.0
    } else {
        1.0
    }
}

pub fn parse(svg: &str) -> Option<(Vec<Layer>, usize)> {
    let head = svg.find("<path d=\"")?;
    let mut out = Vec::new();
    let mut pos = head;
    while let Some(i) = svg[pos..].find("<path d=\"") {
        let ds = pos + i + 9;
        let de = ds + svg[ds..].find('"')?;
        let fs = de + svg[de..].find(" fill=\"")? + 7;
        let fe = fs + svg[fs..].find('"')?;
        let color = parse_hex(&svg[fs..fe])?;
        let ts = fe + svg[fe..].find("translate(")? + 10;
        let te = ts + svg[ts..].find(')')?;
        let mut it = svg[ts..te].split(',');
        let off = (it.next()?.trim().parse().ok()?, it.next()?.trim().parse().ok()?);
        let mut layer = Layer { subs: parse_d(&svg[ds..de], off), off, color, side: 1.0, src: Some((ds, de)) };
        layer.side = orientation(&layer);
        out.push(layer);
        pos = te;
    }
    Some((out, head))
}

pub fn scaled(layers: &[Layer], f: f32) -> Vec<Layer> {
    layers
        .iter()
        .map(|l| {
            let mut c = l.clone();
            for s in c.subs.iter_mut() {
                for p in s.pts.iter_mut() {
                    *p = (p.0 * f, p.1 * f);
                }
            }
            c
        })
        .collect()
}

fn ticks(v: f32, scale: f32) -> i64 {
    (v * scale).round() as i64
}

fn number(out: &mut String, t: i64, prec: u32, dot: &mut bool) {
    let mut tok = String::new();
    if t < 0 {
        tok.push('-');
    }
    let a = t.unsigned_abs();
    let div = 10u64.pow(prec);
    let (ip, fp) = (a / div, a % div);
    if ip > 0 {
        tok.push_str(&ip.to_string());
    }
    let mut frac = String::new();
    if fp > 0 {
        frac = format!("{:0width$}", fp, width = prec as usize);
        while frac.ends_with('0') {
            frac.pop();
        }
    }
    if !frac.is_empty() {
        tok.push('.');
        tok.push_str(&frac);
    }
    if ip == 0 && frac.is_empty() {
        tok.push('0');
    }
    let starts_dot = tok.starts_with('.') || tok.starts_with("-.");
    let last = out.as_bytes().last().copied().unwrap_or(b' ');
    let need_sep = last.is_ascii_digit() || last == b'.';
    if need_sep && !tok.starts_with('-') && !(starts_dot && *dot) {
        out.push(' ');
    }
    *dot = tok.contains('.');
    out.push_str(&tok);
}

pub fn emit_d(l: &Layer, prec: u32) -> String {
    let scale = 10f32.powi(prec as i32);
    let mut out = String::new();
    let mut dot = false;
    let mut prev_start = (0i64, 0i64);
    for (si, sub) in l.subs.iter().enumerate() {
        let q = |p: (f32, f32)| (ticks(p.0 - l.off.0, scale), ticks(p.1 - l.off.1, scale));
        let start = q(sub.pts[0]);
        if si == 0 {
            out.push('M');
            number(&mut out, start.0, prec, &mut dot);
            number(&mut out, start.1, prec, &mut dot);
        } else {
            out.push('m');
            number(&mut out, start.0 - prev_start.0, prec, &mut dot);
            number(&mut out, start.1 - prev_start.1, prec, &mut dot);
        }
        prev_start = start;
        let mut cur = start;
        let mut idx = 0;
        let mut last_cmd = b'm';
        for &ln in &sub.line {
            if ln {
                if last_cmd != b'l' {
                    out.push('l');
                    last_cmd = b'l';
                }
                let e = q(sub.pts[idx + 1]);
                number(&mut out, e.0 - cur.0, prec, &mut dot);
                number(&mut out, e.1 - cur.1, prec, &mut dot);
                cur = e;
                idx += 1;
            } else {
                if last_cmd != b'c' {
                    out.push('c');
                    last_cmd = b'c';
                }
                for k in 1..4 {
                    let e = q(sub.pts[idx + k]);
                    number(&mut out, e.0 - cur.0, prec, &mut dot);
                    number(&mut out, e.1 - cur.1, prec, &mut dot);
                    if k == 3 {
                        cur = e;
                    }
                }
                idx += 3;
            }
        }
        out.push('z');
    }
    out
}
