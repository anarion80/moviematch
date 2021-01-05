import React, {
  useCallback,
  useContext,
  useEffect,
  useState,
} from "https://cdn.skypack.dev/react@17.0.1?dts";
import "./Join.css";
import { Field } from "../components/Field.tsx";
import { Spinner } from "../components/Spinner.tsx";
import { Button } from "../components/Button.tsx";
import { ButtonContainer } from "../components/ButtonContainer.tsx";
import { ScreenProps } from "../components/Screen.ts";
import { MovieMatchContext } from "../store.ts";
import {
  JoinRoomError,
  JoinRoomSuccess,
} from "../../../../types/moviematch.d.ts";
import { Layout } from "../components/Layout.tsx";

export const JoinScreen = ({
  navigate,
  dispatch,
  params,
}: ScreenProps<{ errorMessage?: string } | undefined>) => {
  const store = useContext(MovieMatchContext);
  const [roomName, setRoomName] = useState<string | undefined>(
    store.room?.name ?? ""
  );
  const [roomNameError, setRoomNameError] = useState<string | undefined>();
  const [joinError, setJoinError] = useState<string | undefined>(
    params?.errorMessage
  );
  const handleJoin = useCallback(async () => {
    if (roomName) {
      navigate({ path: "loading" });
      dispatch({ type: "setRoom", payload: { name: roomName, joined: false } });
      try {
        const joinMsg: JoinRoomSuccess = await store.client.joinRoom({
          roomName,
        });
        dispatch({
          type: "setRoom",
          payload: {
            name: roomName,
            joined: true,
            media: joinMsg.media,
            matches: joinMsg.previousMatches,
          },
        });
        navigate({ path: "rate" });
      } catch (err) {
        const joinRoomError: JoinRoomError = JSON.parse(err.message);

        navigate({
          path: "join",
          params: {
            errorMessage: `${joinRoomError.name}: ${joinRoomError.message}`,
          },
        });
      }
    } else {
      setRoomNameError(`Room name is required!`);
    }
  }, [roomName]);

  useEffect(() => {
    if (roomName && !roomNameError && !joinError) {
      handleJoin();
    }
  }, [store.room?.name, roomNameError, joinError]);

  if (store.room?.name && !params?.errorMessage) {
    return (
      <Layout>
        <Spinner />
      </Layout>
    );
  }

  return (
    <Layout>
      <form
        className="JoinScreen_Form"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        {joinError && <p style={{ color: "red" }}>{joinError}</p>}
        <Field
          label="Room Name"
          name="roomName"
          value={roomName}
          errorMessage={roomNameError}
          onChange={setRoomName}
          paddingTop="s4"
        />
        <ButtonContainer paddingTop="s7">
          <Button appearance="primary" onPress={handleJoin}>
            Join
          </Button>
          <Button
            appearance="secondary"
            onPress={() => {
              navigate({
                path: "createRoom",
                params: { roomName: roomName ?? "" },
              });
            }}
          >
            Create
          </Button>
        </ButtonContainer>
      </form>
    </Layout>
  );
};