# Generates the robustness fixtures in this folder. Run: python3 -I gen_qa.py
# bom_crlf_Q.csv, the long unicode name, corrupt_unicorn.zip, images_only.zip and picture.jpg come from ../standins/gen_standins.py
import os, math, random
D = os.path.dirname(os.path.abspath(__file__)); random.seed(7)
w = lambda n, b: open(os.path.join(D, n), 'wb').write(b)
w('empty.csv', b'')
w('junk.csv', bytes(random.getrandbits(8) for _ in range(20000)))
import zipfile
with zipfile.ZipFile(os.path.join(D, 'not_unicorn.zip'), 'w') as f: f.writestr('readme.txt', 'hello'); f.writestr('data/notes.json', '{"a": 1}')
# HPLC trace with semicolons and decimal commas
rows = ['Time (min);Signal (mAU)'] + ['%s;%s' % (('%.3f' % (i*0.01)).replace('.', ','), ('%.3f' % (1 + 120*math.exp(-0.5*((i*0.01-6)/0.12)**2))).replace('.', ',')) for i in range(1500)]
w('decimal_comma.csv', ('\r\n'.join(rows) + '\r\n').encode())
# NanoDrop export with nucleic acid only
w('nanodrop_nucleic_only.csv', ('Sample Name,Date & Time,Nucleic Acid(ng/uL),A260/A280,A260/A230,A260 (Abs),A280 (Abs),Sample Type\r\n' + ''.join('"DNA %d",10/7/2026 14:1%d,%.1f,1.85,2.10,%.3f,%.3f,dsDNA\r\n' % (i, i, 50+i, 1+i/10, 0.55+i/20) for i in range(1, 4))).encode())
# the 200k-point UNICORN-style CSV is written at test time by bigCsv() in ../../lib/harness.js (#1843), not tracked in git
print('ok')
