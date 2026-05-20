"""I/O-Schicht: OTX-Reader, -Loader, -Inspector, -Diff, -Writer."""

from osim_engine.io.otx_loader import LoadResult, OtxLoader, load_otx_file
from osim_engine.io.otx_reader import OtxFile, OtxObject, parse_otx, parse_otx_file
from osim_engine.io.otx_writer import (
    OtxWriter,
    WriterHandler,
    dump_simulator_to_otx,
    encode_value,
    format_object,
    register_writer,
)

__all__ = [
    # Reader
    "OtxFile",
    "OtxObject",
    "parse_otx",
    "parse_otx_file",
    # Loader
    "LoadResult",
    "OtxLoader",
    "load_otx_file",
    # Writer
    "OtxWriter",
    "WriterHandler",
    "dump_simulator_to_otx",
    "encode_value",
    "format_object",
    "register_writer",
]
