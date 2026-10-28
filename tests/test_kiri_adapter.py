"""Offline API contract checks; no real credentials or paid requests."""
from contextlib import redirect_stdout
from email import policy
from email.parser import BytesParser
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("kiri_adapter", ROOT / "scripts" / "reconstruct_kiri.py")
kiri = importlib.util.module_from_spec(spec)
spec.loader.exec_module(kiri)


class KiriContractTests(unittest.TestCase):
    def setUp(self):
        self.cache = (ROOT / ".cache" / "contract-tests").resolve()
        self.cache.mkdir(parents=True, exist_ok=True)
        self.temp = tempfile.TemporaryDirectory(dir=self.cache)
        self.root = Path(self.temp.name).resolve()
        assert self.root.parent == self.cache
        self.video = self.root / "重建小样" / "upload_h264.mp4"
        self.video.parent.mkdir()
        self.video.write_bytes(b"fixture-video-content")

    def tearDown(self):
        self.temp.cleanup()

    def invoke(self, args):
        output = io.StringIO()
        with patch.object(kiri,"ROOT",self.root), patch.dict(os.environ,{"KIRI_API_KEY":"fixture-secret"}), patch("sys.argv",["reconstruct_kiri.py",*args]), redirect_stdout(output):
            kiri.main()
        self.assertNotIn("fixture-secret",output.getvalue())
        return output.getvalue()

    def test_room_upload_keeps_background_and_video_bytes(self):
        body,content_type=kiri.multipart(self.video,"photo")
        message=BytesParser(policy=policy.default).parsebytes(f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode()+body)
        parts={p.get_param("name",header="Content-Disposition"):p.get_payload(decode=True) for p in message.iter_parts()}
        self.assertEqual(parts["isMask"],b"0")
        self.assertEqual(parts["fileFormat"],b"glb")
        self.assertEqual(parts["videoFile"],self.video.read_bytes())

    def test_documented_and_live_success_codes(self):
        for code in (0,200):
            with self.subTest(code=code):
                reply=io.BytesIO(json.dumps({"code":code,"ok":True,"data":{"balance":10}}).encode())
                with patch.object(kiri.urllib.request,"build_opener") as opener:
                    opener.return_value.open.return_value=reply
                    self.assertEqual(kiri.api("/balance","fixture-secret"),{"balance":10})

    def test_photo_set_sends_repeated_image_parts(self):
        image=self.root/"image.jpg"
        image.write_bytes(b"jpeg-fixture")
        body,content_type=kiri.multipart(self.video,"photo",[image,image])
        message=BytesParser(policy=policy.default).parsebytes(f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode()+body)
        parts=[p for p in message.iter_parts() if p.get_param("name",header="Content-Disposition")=="imagesFiles"]
        self.assertEqual(len(parts),2)
        self.assertTrue(all(p.get_payload(decode=True)==b"jpeg-fixture" for p in parts))

    def test_isolated_frame_project_does_not_use_historical_images(self):
        frames=self.root/'generated-frames';frames.mkdir()
        for i in range(20):(frames/f'frame_{i:04d}.jpg').write_bytes(f'frame-{i}'.encode())
        output=self.root/'new-video-run'/'cloud'
        calls=[]
        def fake_api(path,key,data=None,content_type=None):
            calls.append(path)
            if path=='/balance':return {'balance':10}
            if data is not None:return {'serialize':'video-only-fixture'}
            return {'status':0}
        with patch.object(kiri,'api',side_effect=fake_api):
            self.invoke(['--submit','--method','3dgs','--input','images','--images-dir',str(frames),'--output-dir',str(output)])
        task=json.loads((output/'task.json').read_text())
        self.assertEqual(len(task['input_image_manifest']),20)
        self.assertIn('/3dgs/image',calls)
        self.assertFalse((self.root/'重建小样'/'kiri_3dgs_images').exists())

    def test_status_query_can_leave_download_for_resumable_worker(self):
        output=self.root/'saved-task';output.mkdir()
        (output/'task.json').write_text(json.dumps({'serialize':'ready-fixture'}))
        with patch.object(kiri,'api',return_value={'status':2}) as request:
            self.invoke(['--poll','--no-download','--output-dir',str(output)])
        self.assertEqual(request.call_count,1)
        self.assertFalse((output/'model.zip').exists())

    def test_saved_task_prevents_duplicate_billing(self):
        posts=[]
        def fake_api(path,key,data=None,content_type=None):
            if path == "/balance":
                return {"balance":10}
            if data is not None:
                posts.append(path)
                return {"serialize":"fixture-task"}
            return {"status":0}
        with patch.object(kiri,"api",side_effect=fake_api):
            self.invoke(["--submit"])
            self.invoke(["--submit"])
        self.assertEqual(posts,["/photo/video"])
        self.assertTrue((self.video.parent/"kiri_photo"/"task.json").exists())

    def test_uncertain_submission_is_not_automatically_repeated(self):
        posts=[]
        def fake_api(path,key,data=None,content_type=None):
            if path == "/balance":
                return {"balance":10}
            posts.append(path)
            raise OSError("simulated disconnect")
        with patch.object(kiri,"api",side_effect=fake_api):
            with self.assertRaises(OSError):
                self.invoke(["--submit"])
            with self.assertRaisesRegex(ValueError,"uncertain status"):
                self.invoke(["--submit"])
            self.assertEqual(posts,["/photo/video"])


if __name__ == "__main__":
    unittest.main()
