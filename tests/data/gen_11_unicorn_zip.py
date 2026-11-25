import os
import sys
import io
import numpy as np
import zipfile

# Add tests/data to sys.path to import gen_chrom
HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.append(HERE)

from gen_chrom import write_unicorn_zip, signal, OUT, plate_labels, net_floats

class NonSeekableStream(io.RawIOBase):
    def __init__(self):
        self.buf = bytearray()
    def write(self, b):
        self.buf.extend(b)
        return len(b)
    def seekable(self):
        return False
    def tell(self):
        return len(self.buf)

def stream_zip_bytes(entries):
    ns = NonSeekableStream()
    with zipfile.ZipFile(ns, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for name, data in entries:
            zi = zipfile.ZipInfo(name, date_time=(2026, 10, 22, 9, 0, 0))
            zi.compress_type = zipfile.ZIP_DEFLATED
            with z.open(zi, 'w') as f:
                f.write(data)
    return bytes(ns.buf)

def gen_descriptor_unicorn():
    np.random.seed(42)
    fn = 'descriptor_unicorn.zip'
    inj = 1.0
    flow = 0.5
    x = np.round(np.arange(0, 30.0001, 0.05), 4).astype(float)
    y = signal(x, [(inj + 12.0, 0.4, 40.0), (inj + 16.0, 0.4, 70.0)])
    inner_curve_bytes = stream_zip_bytes([
        ('CoordinateData.VolumesDataType', b'System.Single[]\r\n'),
        ('CoordinateData.Volumes', net_floats(x)),
        ('CoordinateData.AmplitudesDataType', b'System.Single[]\r\n'),
        ('CoordinateData.Amplitudes', net_floats(y))
    ])
    xml = (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<Chromatogram xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" FormatVersion="9" UNICORNVersion="7.10.0.2756">'
        '<ChromatogramName>Chrom.1</ChromatogramName><IsReadonly>false</IsReadonly><TimeUnit>min</TimeUnit><VolumeUnit>ml</VolumeUnit>'
        '<Created>2026-10-22T09:00:00.000</Created><CreatedUtcOffsetMinutes>-420</CreatedUtcOffsetMinutes>'
        '<Curves>'
        '<Curve CurveDataType="UV"><Name>UV 1_280</Name><IsoChroneType>Volume</IsoChroneType>'
        '<TimeUnit>min</TimeUnit><VolumeUnit>ml</VolumeUnit><AmplitudePrecision>3</AmplitudePrecision><AmplitudeUnit>mAU</AmplitudeUnit>'
        '<IsOriginalData>true</IsOriginalData><IsReadOnly>false</IsReadOnly><CurveNumber>1</CurveNumber><ColumnVolume>23.562</ColumnVolume><ColumnVolumeUnitName>ml</ColumnVolumeUnitName>'
        '<CurvePoints><CurvePoint><IsFullResolution>true</IsFullResolution><BinaryCurvePointsFileName>Chrom.1_1_True</BinaryCurvePointsFileName></CurvePoint></CurvePoints>'
        '<CurveUVInfo><IsUVValuesNormalizedToNominalUVPathLength>true</IsUVValuesNormalizedToNominalUVPathLength><UVPathLength>2</UVPathLength><NominalUVPathLength>2</NominalUVPathLength><IsSystemProvided>true</IsSystemProvided></CurveUVInfo>'
        '</Curve>'
        '</Curves>'
        '<EventCurves>'
        '<EventCurve EventCurveType="Fraction"><Name>Fraction</Name><TimeUnit>min</TimeUnit><VolumeUnit>ml</VolumeUnit><IsOriginalData>true</IsOriginalData><CurveNumber>11</CurveNumber><ColumnVolume>23.562</ColumnVolume><ColumnVolumeUnitName>ml</ColumnVolumeUnitName>'
        '<Events><Event EventType="Method" EventSubType="Undefined"><EventTime>14.00000</EventTime><EventVolume>7.00000</EventVolume><EventText>A1</EventText><InstructionFeedback>0</InstructionFeedback></Event></Events>'
        '</EventCurve>'
        '</EventCurves>'
        '</Chromatogram>'
    ).encode('utf-8')
    outer_entries = [
        ('CalibrationSettingData', b'\x00' * 64),
        ('Chrom.1.Xml', xml),
        ('Chrom.1_1_True', inner_curve_bytes),
        ('Manifest.xml', b'<ExportManifest FormatVersion="1"><Details><FileName>Result.xml</FileName><FileType>Result</FileType></Details></ExportManifest>'),
        ('Result.xml', b'<Result FormatVersion="1" />'),
        ('MethodData', b'\x00' * 128),
        ('SystemData', b'\x00' * 128)
    ]
    path = os.path.join(OUT, fn)
    with open(path, 'wb') as f:
        f.write(stream_zip_bytes(outer_entries))

def gen_valid_unicorn():
    np.random.seed(42)
    fn = 'valid_unicorn.zip'
    inj = 1.0
    flow = 0.5
    x = np.round(np.arange(0, 30.0001, 0.002), 5).astype(float)
    vs = [(12.0, 0.4, 40.0), (16.0, 0.4, 70.0)]
    comps = [(inj + v, s, h) for v, s, h in vs]
    y = signal(x, comps)
    xs4 = x[::20]
    labels = plate_labels(20)
    fr = [(inj + 0.0, 'Waste')] + [(inj + 6.0 + 0.5*i, l) for i, l in enumerate(labels)] + [(inj + 16.0, 'Waste')]
    log = [(0.0, 'Method Run 10/22/2026 5:00:00 PM -07:00 Method: Valid test Result: /DefaultHome/valid 001')]

    curves = [
        dict(name='UV', type='UV', yu='mAU', xs=x, ys=y, num=1, uvpath=2),
        dict(name='Conductivity', type='Conduction', yu='mS/cm', xs=xs4, ys=np.full(xs4.size, 15.0), num=2),
        dict(name='Conc B', type='Other', yu='%B', xs=xs4, ys=np.zeros(xs4.size), num=3),
        dict(name='Flow', type='Other', yu='ml/min', xs=xs4, ys=np.full(xs4.size, flow), num=4)
    ]

    write_unicorn_zip(os.path.join(OUT, fn), 23.562, curves, {'Fraction': fr, 'Injection': [(inj, 'Inj')], 'Logbook': log}, flow)

def gen_missing_curve_unicorn():
    np.random.seed(42)
    fn = 'missing_curve.zip'
    inj = 1.0
    flow = 0.5
    x = np.round(np.arange(0, 30.0001, 0.002), 5).astype(float)
    y = signal(x, [(inj + 12.0, 0.4, 40.0)])
    xs4 = x[::20]
    fr = [(inj + 0.0, 'Waste'), (inj + 6.0, '1.A.1')]
    log = [(0.0, 'Method Run')]

    curves = [
        dict(name='Conductivity', type='Conduction', yu='mS/cm', xs=xs4, ys=np.full(xs4.size, 15.0), num=2),
        dict(name='UV', type='UV', yu='mAU', xs=x, ys=y, num=1, uvpath=2)
    ]

    path = os.path.join(OUT, fn)
    write_unicorn_zip(path, 23.562, curves, {'Fraction': fr, 'Injection': [(inj, 'Inj')], 'Logbook': log}, flow)

    temp_zip = path + ".tmp"
    with zipfile.ZipFile(path, 'r') as zin, zipfile.ZipFile(temp_zip, 'w', zipfile.ZIP_DEFLATED) as zout:
        for item in zin.infolist():
            if item.filename != 'Chrom.1_1_True':
                zout.writestr(item, zin.read(item.filename))
    os.remove(path)
    os.rename(temp_zip, path)

def gen_not_unicorn():
    fn = 'not_unicorn.zip'
    path = os.path.join(OUT, fn)
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as zout:
        zout.writestr("some_file.txt", "This is not a unicorn archive")
        zout.writestr("another_file.csv", "Time,Value\n1,2\n3,4")

def gen_zero_measurement_unicorn():
    np.random.seed(42)
    fn = 'zero_measurement.zip'
    inj = 1.0
    flow = 0.5
    x = np.round(np.arange(0, 30.0001, 0.002), 5).astype(float)
    y = signal(x, [(inj + 12.0, 0.4, 40.0)])
    xs4 = x[::20]
    fr = [(inj + 0.0, 'Waste'), (inj + 6.0, '1.A.1')]
    log = [(0.0, 'Method Run')]

    curves = [
        dict(name='Conductivity', type='Conduction', yu='mS/cm', xs=xs4, ys=np.full(xs4.size, 15.0), num=2),
        dict(name='UV', type='UV', yu='mAU', xs=np.array([]), ys=np.array([]), num=1, uvpath=2)
    ]

    path = os.path.join(OUT, fn)
    write_unicorn_zip(path, 23.562, curves, {'Fraction': fr, 'Injection': [(inj, 'Inj')], 'Logbook': log}, flow)



if __name__ == '__main__':
    gen_valid_unicorn()
    gen_descriptor_unicorn()
    gen_zero_measurement_unicorn()
    gen_missing_curve_unicorn()
    gen_not_unicorn()
    print("Generated 11_unicorn_zip test files.")
