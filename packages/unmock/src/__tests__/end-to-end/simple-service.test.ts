import axios from "axios";
import unmock, { Arr, transform, u } from "../../";
const { responseBody } = transform;

unmock
  .nock("https://api.foo.com/v1", "foo")
  .get("/users")
  .reply(
    200,
    u.array(
      u.type(
        {
          address: {
            city: u.string(),
            state: u.string(),
          },
        },
        {
          id: u.number(),
          name: u.number(),
        },
      ),
    ),
  );

describe("Simple service test", () => {
  it("Should return sane values from a simple service", async () => {
    const { foo } = unmock.on().services;
    foo.state(responseBody().minItems(56));
    const response0 = await axios("https://api.foo.com/v1/users");
    expect(response0.data.length).toBeGreaterThanOrEqual(56);
    foo.state(
      responseBody({ lens: [Arr] }).required("id"),
      responseBody().listToTuple(5),
      responseBody({ lens: [2, "id"] }).const(55),
      responseBody({ lens: [3, "id"] }).const(56),
    );
    const response1 = await axios("https://api.foo.com/v1/users");
    expect(response1.data.length).toBe(5);
    expect(typeof response1.data[1].address.city).toBe("string");
    expect(response1.data[2].id).toBe(55);
    expect(response1.data[3].id).toBe(56);
  });
});