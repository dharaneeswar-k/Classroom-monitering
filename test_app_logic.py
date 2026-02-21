import json

payload = {
    "cameras": [
        {
            "_id": "69985a75c4be6991b5d9ee8e",
            "name": "CAM 01",
            "streamUrl": "0",
            "classroomId": {
                "_id": "69985a5dc4be6991b5d9ee89",
                "name": "CSE A"
            },
            "status": "active"
        },
        {
            "_id": "6998aea06a0bd8b1c6fdb0f0",
            "name": "CAM 02",
            "streamUrl": "http://192.168.1.9:4747/video",
            "classroomId": {
                "_id": "69985a5dc4be6991b5d9ee89",
                "name": "CSE A"
            },
            "status": "active"
        }
    ]
}

def get_id_from_field(field):
    if isinstance(field, dict):
        return field.get("_id", "")
    return str(field) if field else ""

classroomId = "69985a5dc4be6991b5d9ee89"
classroom_cameras = []
for c in payload["cameras"]:
    cam_classroom_id = get_id_from_field(c.get("classroomId", ""))
    if cam_classroom_id == classroomId:
        classroom_cameras.append(c)

print([c["_id"] for c in classroom_cameras])
