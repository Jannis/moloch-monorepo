import React from "react";
import { BrowserRouter as Router, Route, Switch, Redirect } from "react-router-dom";

import Background from "./components/Background";
import Header from "./components/Header";
import Wrapper from "./components/Wrapper";
import Home from "./components/Home";
import ProposalList from "./components/ProposalList";
import MemberList from "./components/MemberList";
import ProposalSubmission from "./components/ProposalSubmission";
import GuildBank from "./components/GuildBank";
import Login from "./components/Login";
import NotFound from "./components/NotFound";
import { ApolloProvider, Query } from "react-apollo";
import gql from "graphql-tag";
import { defaults, resolvers } from "./resolvers";
import { typeDefs } from "./schema";
import { ApolloClient } from "apollo-client";
import { InMemoryCache } from "apollo-cache-inmemory";
import { HttpLink } from "apollo-link-http";
import { onError } from "apollo-link-error";
import { ApolloLink } from "apollo-link";
import { withClientState } from "apollo-link-state";
import { CachePersistor } from "apollo-cache-persist";
import { GET_EXCHANGE_RATE, GET_TOTAL_SHARES, GET_GUILD_BANK_VALUE } from "./helpers/graphQlQueries";
import { getMedianizer, getMoloch, getWeb3 } from "./web3";
import { utils } from "ethers";

console.log(process.env);

const cache = new InMemoryCache();

const stateLink = withClientState({
  cache,
  defaults,
  resolvers,
  typeDefs
});

const persistor = new CachePersistor({
  cache,
  storage: window.localStorage,
  maxSize: false,
  debug: true
});

const httpLink = new HttpLink({
  uri: process.env.REACT_APP_GRAPH_NODE_URI
});

const client = new ApolloClient({
  cache,
  link: ApolloLink.from([
    onError(({ graphQLErrors, networkError }) => {
      if (graphQLErrors)
        graphQLErrors.map(({ message, locations, path }) =>
          console.log(`[GraphQL error]: Message: ${message}, Location: ${locations}, Path: ${path}`)
        );
      if (networkError) console.log(`[Network error]: ${networkError}`);
    }),
    stateLink,
    httpLink
  ])
});

const IS_LOGGED_IN = gql`
  query IsUserLoggedIn {
    loggedInUser @client
  }
`;
class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      restored: false,
      exchangeRate: "0",
      totalShares: "0",
      guildBankValue: "0",
    };
  }

  async componentDidMount() {
    await persistor.restore();

    let { data: loggedInUserData } = await client.query({
      query: IS_LOGGED_IN
    });
    const loggedInUser = loggedInUserData.loggedInUser

    if (loggedInUser) {
      let { data: exchangeRateData } = await client.query({
        query: GET_EXCHANGE_RATE
      });
      let rate = exchangeRateData.exchangeRate;
      if (!rate) {
        const medianizer = await getMedianizer();
        rate = (await medianizer.compute())[0];
        client.writeData({
          data: {
            exchangeRate: rate
          }
        });
      }

      let { data: sharesData } = await client.query({
        query: GET_TOTAL_SHARES
      });
      let shares = sharesData.totalShares;
      if (!shares) {
        const moloch = await getMoloch();
        shares = await moloch.totalShares();
        console.log("shares: ", shares.toString());
        client.writeData({
          data: {
            totalShares: shares.toString()
          }
        });
      }

      const eth = await getWeb3();
      let { data: guildBankData } = await client.query({
        query: GET_GUILD_BANK_VALUE
      });
      let guildBankValue = guildBankData.guildBankValue;
      if (!guildBankValue) {
        guildBankValue = await eth.getBalance(process.env.REACT_APP_GUILD_BANK_ADDRESS);
        client.writeData({
          data: {
            guildBankValue: guildBankValue.toString()
          }
        });
      }

      const shareValue = utils.bigNumberify(guildBankValue).gt(0) ? utils.bigNumberify(shares).div(guildBankValue) : 0

      client.writeData({
        data: {
          shareValue: shareValue.toString()
        }
      });
    }

    this.setState({ restored: true });
  }

  render() {
    return this.state.restored ? (
      <ApolloProvider client={client}>
        <Router>
          <Query query={IS_LOGGED_IN}>
            {({ data }) => {
              console.log("data: ", data.loggedInUser);
              return (
                <>
                  <Background />
                  <Header loggedInUser={data.loggedInUser} />
                  <Wrapper>
                    <Switch>
                      <Route
                        exact
                        path="/"
                        render={props =>
                          data.loggedInUser ? <Home {...props} loggedInUser={data.loggedInUser} /> : <Redirect to={{ pathname: "/login" }} />
                        }
                      />
                      <Route
                        path="/proposals"
                        render={props =>
                          data.loggedInUser ? <ProposalList {...props} loggedInUser={data.loggedInUser} /> : <Redirect to={{ pathname: "/login" }} />
                        }
                      />
                      <Route
                        path="/members"
                        render={props =>
                          data.loggedInUser ? <MemberList {...props} loggedInUser={data.loggedInUser} /> : <Redirect to={{ pathname: "/login" }} />
                        }
                      />
                      <Route
                        path="/proposalsubmission"
                        render={props =>
                          data.loggedInUser ? (
                            <ProposalSubmission {...props} loggedInUser={data.loggedInUser} />
                          ) : (
                            <Redirect to={{ pathname: "/login" }} />
                          )
                        }
                      />
                      <Route
                        path="/guildbank"
                        render={props =>
                          data.loggedInUser ? <GuildBank {...props} loggedInUser={data.loggedInUser} /> : <Redirect to={{ pathname: "/login" }} />
                        }
                      />
                      <Route path="/login" render={props => <Login {...props} />} />
                      <Route component={NotFound} />
                    </Switch>
                  </Wrapper>
                </>
              );
            }}
          </Query>
        </Router>
      </ApolloProvider>
    ) : (
      <div>Loading!!!</div>
    );
  }
}

export default App;
